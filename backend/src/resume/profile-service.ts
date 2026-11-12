/**
 * Candidate Profile & Resume Service.
 *
 * Handles private resume storage, profile CRUD, active resume switching,
 * and deterministic profile completeness calculation.
 *
 * CRITICAL INVARIANTS:
 * 1. Strict User Isolation (All queries/mutations scoped to user_id).
 * 2. Private Storage (Resumes stored in private user directories, never public).
 * 3. Deterministic Completeness (Formula based on verified data presence, no AI scores).
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { eq, and, desc, sql } from 'drizzle-orm';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { parseResumeText } from './resume-parser.js';
import {
  syncProfileToEvidence,
  type SyncEvidenceResult,
} from '../resumes/career-evidence-service.js';
import { createLogger } from '../utils/logger.js';
import { calculateProfileCompleteness } from './completeness-calculator.js';
import type {
  CandidateProfileDto,
  ResumeMetadataDto,
} from './resume-types.js';

export { calculateProfileCompleteness };

const log = createLogger('resume:profile-service');

const RESUME_STORAGE_DIR = path.resolve(process.cwd(), 'storage', 'resumes');

// Ensure base private storage directory exists
if (!fs.existsSync(RESUME_STORAGE_DIR)) {
  fs.mkdirSync(RESUME_STORAGE_DIR, { recursive: true });
}

/**
 * Normalizes institution name for deterministic duplicate comparison.
 * Collapses whitespace, removes punctuation, ignores case, strips common prefixes ("at ", "from ").
 */
export function normalizeInstitution(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/^(?:at|from)\s+/i, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Expands canonical institution acronyms commonly used in India and globally.
 */
export function expandInstitutionAcronyms(s: string): string {
  return s
    .replace(/\biit\b/g, 'indian institute of technology')
    .replace(/\bnit\b/g, 'national institute of technology')
    .replace(/\biiit\b/g, 'indian institute of information technology')
    .replace(/\bbits\b/g, 'birla institute of technology and science')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks whether two institutions represent the exact same institution and campus.
 * Preserves campus identity where distinguishable (e.g. BITS Pilani vs BITS Pilani, Goa Campus).
 */
export function areInstitutionsEquivalent(instA: string, instB: string): boolean {
  const normA = normalizeInstitution(instA);
  const normB = normalizeInstitution(instB);

  if (!normA && !normB) return true;
  if (!normA || !normB) return false;

  const isGenA = normA === 'university college' || normA === 'university' || normA === 'college';
  const isGenB = normB === 'university college' || normB === 'university' || normB === 'college';

  // If one is generic placeholder, it matches only as a fallback
  if (isGenA || isGenB) {
    return true;
  }

  // Exact normalized match
  if (normA === normB) return true;

  // Acronym-expanded exact match (e.g. "IIT Bombay" === "Indian Institute of Technology, Bombay")
  const expA = expandInstitutionAcronyms(normA);
  const expB = expandInstitutionAcronyms(normB);
  if (expA === expB) return true;

  // Campus distinction check:
  // If one institution has an explicit campus keyword (e.g. "goa campus") that the other lacks,
  // or specifies a different campus, they represent distinct campus identities and MUST NOT be merged!
  const campusWordA = /\bcampus\b/i.test(normA);
  const campusWordB = /\bcampus\b/i.test(normB);
  if (campusWordA !== campusWordB) {
    // One specifies a sub-campus/branch, the other does not (e.g. "BITS Pilani" vs "BITS Pilani, Goa Campus")
    return false;
  }

  // Token set equivalence for word reordering (e.g. "Delhi University" vs "University of Delhi")
  const stopWords = new Set(['of', 'and', 'the', 'in', 'at', 'for']);
  const getTokens = (s: string) =>
    expandInstitutionAcronyms(s)
      .split(/\s+/)
      .filter((t) => t && !stopWords.has(t))
      .sort()
      .join(' ');

  if (getTokens(normA) === getTokens(normB)) {
    return true;
  }

  return false;
}

/**
 * Normalizes degree titles to detect identical qualifications.
 * Handles common abbreviations: b.tech/btech/b.e./bachelor of technology -> "b.tech / b.e."
 */
export function normalizeDegree(deg: string): string {
  if (!deg) return '';
  const d = deg.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  if (/\b(btech|b\s*tech|be|b\s*e|bachelor\s+of\s+technology|bachelor\s+of\s+engineering)\b/i.test(d)) {
    return 'b.tech / b.e.';
  }
  if (/\b(mtech|m\s*tech|me|m\s*e|master\s+of\s+technology|master\s+of\s+engineering)\b/i.test(d)) {
    return 'm.tech / m.e.';
  }
  if (/\b(bca|bachelor\s+of\s+computer\s+applications)\b/i.test(d)) {
    return 'bca';
  }
  if (/\b(mca|master\s+of\s+computer\s+applications)\b/i.test(d)) {
    return 'mca';
  }
  if (/\b(bsc|b\s*sc|bachelor\s+of\s+science)\b/i.test(d)) {
    return 'b.sc';
  }
  if (/\b(msc|m\s*sc|master\s+of\s+science)\b/i.test(d)) {
    return 'm.sc';
  }
  if (/\b(phd|ph\s*d|doctor\s+of\s+philosophy)\b/i.test(d)) {
    return 'ph.d';
  }
  if (/\b(mba|master\s+of\s+business\s+administration)\b/i.test(d)) {
    return 'mba';
  }
  if (/\b(bba|bachelor\s+of\s+business\s+administration)\b/i.test(d)) {
    return 'bba';
  }
  if (/\b(diploma|polytechnic)\b/i.test(d)) {
    return 'diploma';
  }
  return d;
}

/**
 * Normalizes field of study for comparison.
 */
export function normalizeFieldOfStudy(field?: string | null): string {
  if (!field) return '';
  const f = field.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  if (/\b(cs|cse|computer\s+science|computer\s+science\s+and\s+engineering|computer\s+science\s*&\s*engineering)\b/i.test(f)) {
    return 'computer science & engineering';
  }
  if (/\b(it|information\s+technology)\b/i.test(f)) {
    return 'information technology';
  }
  if (/\b(ece|electronics\s+and\s+communication|electronics\s*&\s*communication)\b/i.test(f)) {
    return 'electronics & communication';
  }
  if (/\b(me|mech|mechanical|mechanical\s+engineering)\b/i.test(f)) {
    return 'mechanical engineering';
  }
  if (/\b(ee|electrical|electrical\s+engineering)\b/i.test(f)) {
    return 'electrical engineering';
  }
  if (/\b(civil|civil\s+engineering)\b/i.test(f)) {
    return 'civil engineering';
  }
  return f;
}

/**
 * Deterministically checks whether two education records represent the same qualification.
 * 
 * Rules:
 * 1. Normalized degree must match. (Ensures B.Tech and M.Tech from the same college remain distinct!)
 * 2. Normalized institution and campus must match (acronym-expanded and campus-preserving).
 * 3. Incomplete generic records (missing years + field) never match specific qualifications.
 * 4. If both have start/end years, years must not conflict.
 * 5. If both have specific fields of study, fields must not conflict.
 */
export function isSameEducation(
  existing: {
    institution: string;
    degree: string;
    field_of_study?: string | null;
    start_year?: number | null;
    end_year?: number | null;
  },
  candidate: {
    institution: string;
    degree: string;
    fieldOfStudy?: string | null;
    startYear?: number | null;
    endYear?: number | null;
  }
): boolean {
  // 1. Degree level verification (B.Tech and M.Tech must NEVER match)
  const normExistDeg = normalizeDegree(existing.degree);
  const normCandDeg = normalizeDegree(candidate.degree);
  if (!normExistDeg || !normCandDeg || normExistDeg !== normCandDeg) {
    return false; // Different degree = distinct qualification
  }

  // 2. Institution & campus matching
  const normExistInst = normalizeInstitution(existing.institution);
  const normCandInst = normalizeInstitution(candidate.institution);

  const isGenericExist = !normExistInst || normExistInst === 'university college' || normExistInst === 'university' || normExistInst === 'college';
  const isGenericCand = !normCandInst || normCandInst === 'university college' || normCandInst === 'university' || normCandInst === 'college';

  // Incomplete record check:
  // An incomplete record with generic institution AND missing years AND missing field of study
  // lacks sufficient ground truth to be declared identical to a real qualification.
  if (isGenericExist || isGenericCand) {
    const hasYear = (existing.end_year && candidate.endYear) || (existing.start_year && candidate.startYear);
    const hasField = existing.field_of_study && candidate.fieldOfStudy;
    if (!hasYear && !hasField) {
      return false;
    }
  }

  if (!areInstitutionsEquivalent(existing.institution, candidate.institution)) {
    return false;
  }

  // 3. Field of study check: if both non-empty, must match
  const normExistField = normalizeFieldOfStudy(existing.field_of_study);
  const normCandField = normalizeFieldOfStudy(candidate.fieldOfStudy);
  if (normExistField && normCandField && normExistField !== normCandField) {
    return false;
  }

  // 4. Year check: if both have end_year, must match
  if (existing.end_year && candidate.endYear && existing.end_year !== candidate.endYear) {
    return false;
  }

  // 5. Start year check: if both have start_year, must match
  if (existing.start_year && candidate.startYear && existing.start_year !== candidate.startYear) {
    return false;
  }

  return true;
}

/**
 * Retrieve the candidate profile for a user with all relations and active resume.
 */
export async function getCandidateProfile(userId: string): Promise<CandidateProfileDto | null> {
  const db = getDb();

  const [profileRecord] = await db
    .select()
    .from(schema.candidateProfiles)
    .where(eq(schema.candidateProfiles.user_id, userId))
    .limit(1);

  const skillsRows = await db
    .select()
    .from(schema.candidateSkills)
    .where(eq(schema.candidateSkills.user_id, userId));

  const eduRows = await db
    .select()
    .from(schema.candidateEducations)
    .where(eq(schema.candidateEducations.user_id, userId));

  const projRows = await db
    .select()
    .from(schema.candidateProjects)
    .where(eq(schema.candidateProjects.user_id, userId));

  const certRows = await db
    .select()
    .from(schema.candidateCertifications)
    .where(eq(schema.candidateCertifications.user_id, userId));

  const expRows = await db
    .select()
    .from(schema.candidateExperiences)
    .where(eq(schema.candidateExperiences.user_id, userId));

  const [activeResume] = await db
    .select()
    .from(schema.resumes)
    .where(and(eq(schema.resumes.user_id, userId), eq(schema.resumes.is_active, true)))
    .limit(1);

  const targetRoles = (profileRecord?.target_roles as string[]) || [];

  const completeness = calculateProfileCompleteness({
    hasResume: !!activeResume,
    skillsCount: skillsRows.length,
    educationsCount: eduRows.length,
    projectsCount: projRows.length,
    experiencesCount: expRows.length,
    hasPreferredRoles: targetRoles.length > 0 || !!profileRecord?.headline,
  });

  return {
    id: profileRecord?.id || 'temp-profile',
    userId,
    fullName: profileRecord?.full_name || null,
    headline: profileRecord?.headline || null,
    summary: profileRecord?.summary || null,
    primaryRole: profileRecord?.primary_role || null,
    targetRoles,
    experienceLevel: (profileRecord?.experience_level as 'FRESHER' | 'EXPERIENCED') || 'FRESHER',
    totalExperienceMonths: profileRecord?.total_experience_months || 0,
    completenessScore: completeness.score,
    activeResume: activeResume ? formatResumeDto(activeResume) : null,
    skills: skillsRows.map((s) => ({
      id: s.id,
      skillName: s.skill_name,
      canonicalName: s.canonical_name,
      category: s.category || 'Technical',
      source: s.source as 'PARSED' | 'MANUAL',
    })),
    educations: eduRows.map((e) => ({
      id: e.id,
      institution: e.institution,
      degree: e.degree,
      fieldOfStudy: e.field_of_study,
      startYear: e.start_year,
      endYear: e.end_year,
      grade: e.grade,
    })),
    projects: projRows.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      technologies: (p.technologies as string[]) || [],
      url: p.url,
    })),
    certifications: certRows.map((c) => ({
      id: c.id,
      name: c.name,
      issuer: c.issuer,
      issueYear: c.issue_year,
      url: c.url,
    })),
    experiences: expRows.map((exp) => ({
      id: exp.id,
      companyName: exp.company_name,
      title: exp.title,
      location: exp.location,
      isInternship: exp.is_internship,
      startDate: exp.start_date?.toISOString() || null,
      endDate: exp.end_date?.toISOString() || null,
      isCurrent: exp.is_current,
      description: exp.description,
    })),
    createdAt: profileRecord?.created_at.toISOString() || new Date().toISOString(),
    updatedAt: profileRecord?.updated_at.toISOString() || new Date().toISOString(),
  };
}

export const ALLOWED_RESUME_EXTENSIONS = ['.pdf', '.docx', '.txt'] as const;

export interface ValidatedResumeInfo {
  safeExt: string;
  sanitizedFilename: string;
  canonicalMime: string;
}

/**
 * Validates resume file extension, file size, signatures (magic bytes), and MIME types.
 * Rejects path-traversal attempts, unsupported extensions, and spoofed binary files.
 */
export function validateResumeFile(
  filename: string,
  fileBuffer: Buffer,
  declaredMimeType?: string
): ValidatedResumeInfo {
  if (!filename || typeof filename !== 'string') {
    throw new Error('Filename is required.');
  }

  // Prevent path traversal and control character injection in filename
  if (filename.includes('\0')) {
    throw new Error('Invalid filename: null bytes detected.');
  }

  const rawExt = path.extname(filename).toLowerCase().trim();
  if (!ALLOWED_RESUME_EXTENSIONS.includes(rawExt as any)) {
    throw new Error(
      `Unsupported file format "${rawExt || 'unknown'}". Only .pdf, .docx, and .txt files are supported.`
    );
  }

  // File size bounds
  if (fileBuffer.length === 0) {
    throw new Error('File is empty.');
  }
  const MAX_SIZE = 5 * 1024 * 1024;
  if (fileBuffer.length > MAX_SIZE) {
    throw new Error('File size exceeds maximum limit of 5MB.');
  }

  const normMime = declaredMimeType?.toLowerCase().trim();
  let canonicalMime = '';

  if (rawExt === '.pdf') {
    // PDF Magic Bytes: %PDF- (0x25 0x50 0x44 0x46)
    const isPdfMagic =
      fileBuffer.length >= 4 &&
      fileBuffer[0] === 0x25 &&
      fileBuffer[1] === 0x50 &&
      fileBuffer[2] === 0x44 &&
      fileBuffer[3] === 0x46;

    if (!isPdfMagic) {
      throw new Error('Invalid file signature. File is not a valid PDF document.');
    }

    if (normMime && !['application/pdf', 'application/x-pdf', 'application/octet-stream'].includes(normMime)) {
      throw new Error(`Inconsistent MIME type "${declaredMimeType}" for PDF document.`);
    }
    canonicalMime = 'application/pdf';
  } else if (rawExt === '.docx') {
    // DOCX (ZIP archive) Magic Bytes: PK\x03\x04 (0x50 0x4B 0x03 0x04)
    const isZipMagic =
      fileBuffer.length >= 4 &&
      fileBuffer[0] === 0x50 &&
      fileBuffer[1] === 0x4B &&
      fileBuffer[2] === 0x03 &&
      fileBuffer[3] === 0x04;

    if (!isZipMagic) {
      throw new Error('Invalid file signature. File is not a valid Word document (.docx).');
    }

    if (
      normMime &&
      ![
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/zip',
        'application/x-zip-compressed',
        'application/octet-stream',
      ].includes(normMime)
    ) {
      throw new Error(`Inconsistent MIME type "${declaredMimeType}" for DOCX document.`);
    }
    canonicalMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  } else if (rawExt === '.txt') {
    // Reject known executable magic signatures:
    // MZ (Windows PE): 0x4D 0x5A
    if (fileBuffer.length >= 2 && fileBuffer[0] === 0x4d && fileBuffer[1] === 0x5a) {
      throw new Error('Invalid text file: binary executable signature detected (MZ).');
    }
    // ELF (Linux): 0x7F 0x45 0x4C 0x46
    if (
      fileBuffer.length >= 4 &&
      fileBuffer[0] === 0x7f &&
      fileBuffer[1] === 0x45 &&
      fileBuffer[2] === 0x4c &&
      fileBuffer[3] === 0x46
    ) {
      throw new Error('Invalid text file: binary executable signature detected (ELF).');
    }
    // Mach-O
    if (
      fileBuffer.length >= 4 &&
      ((fileBuffer[0] === 0xca && fileBuffer[1] === 0xfe && fileBuffer[2] === 0xba && fileBuffer[3] === 0xbe) ||
        (fileBuffer[0] === 0xcf && fileBuffer[1] === 0xfa && fileBuffer[2] === 0xed && fileBuffer[3] === 0xfe))
    ) {
      throw new Error('Invalid text file: binary executable signature detected.');
    }

    // Inspect first 1024 bytes for null bytes (binary file check)
    const sampleLimit = Math.min(fileBuffer.length, 1024);
    for (let i = 0; i < sampleLimit; i++) {
      if (fileBuffer[i] === 0x00) {
        throw new Error('Invalid text file: binary characters detected.');
      }
    }

    // HTML / Script tag check to prevent stored XSS smuggling in text resumes
    const sampleText = fileBuffer.slice(0, 512).toString('utf-8').toLowerCase();
    if (sampleText.includes('<script') || sampleText.includes('<!doctype html') || sampleText.includes('<html')) {
      throw new Error('Invalid text file: HTML tags detected.');
    }

    if (normMime && !['text/plain', 'text/markdown', 'application/octet-stream'].includes(normMime)) {
      throw new Error(`Inconsistent MIME type "${declaredMimeType}" for text document.`);
    }
    canonicalMime = 'text/plain';
  }

  // Sanitize filename to avoid path traversal in stored metadata
  const sanitizedFilename = path.basename(filename).replace(/[^\w.-]/g, '_').slice(0, 255);

  return {
    safeExt: rawExt,
    sanitizedFilename: sanitizedFilename || `resume${rawExt}`,
    canonicalMime,
  };
}

/**
 * Safely extracts human-readable text from PDF, DOCX, or TXT file buffers.
 * Sanitizes output to remove null bytes (\0) and control characters for PostgreSQL safety.
 */
export function extractResumeText(fileBuffer: Buffer, fileExt: string): string {
  let extracted = '';

  if (fileExt === '.pdf') {
    // 1. PDF stream decompression and text operator extraction
    try {
      const rawString = fileBuffer.toString('binary');
      const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
      let match: RegExpExecArray | null;

      while ((match = streamRegex.exec(rawString)) !== null) {
        const rawStream = Buffer.from(match[1]!, 'binary');
        let decompressed: Buffer;
        try {
          decompressed = zlib.inflateSync(rawStream);
        } catch {
          try {
            decompressed = zlib.inflateRawSync(rawStream);
          } catch {
            decompressed = rawStream;
          }
        }

        const streamStr = decompressed.toString('utf-8');
        // Extract text from (Text) Tj operators
        const tjRegex = /\(([^)]+)\)\s*Tj/g;
        let tjMatch: RegExpExecArray | null;
        while ((tjMatch = tjRegex.exec(streamStr)) !== null) {
          extracted += tjMatch[1] + ' ';
        }

        // Extract text from [(Text) -10 (More)] TJ array operators
        const tjArrayRegex = /\[([^\]]+)\]\s*TJ/g;
        let arrMatch: RegExpExecArray | null;
        while ((arrMatch = tjArrayRegex.exec(streamStr)) !== null) {
          extracted += arrMatch[1]!.replace(/\(([^)]+)\)/g, ' $1 ') + ' ';
        }
      }
    } catch {
      // Graceful fallback
    }

    // Fallback: If compressed stream extraction yielded minimal text, grab visible ASCII text tokens
    if (extracted.trim().length < 50) {
      const asciiTokens = fileBuffer
        .toString('latin1')
        .replace(/[^\x20-\x7E\r\n\t]/g, ' ')
        .replace(/\s+/g, ' ');
      extracted += ' ' + asciiTokens;
    }
  } else if (fileExt === '.docx') {
    // 2. DOCX (ZIP archive) extraction of word/document.xml
    try {
      let offset = 0;
      while (offset < fileBuffer.length - 30) {
        if (
          fileBuffer[offset] === 0x50 &&
          fileBuffer[offset + 1] === 0x4b &&
          fileBuffer[offset + 2] === 0x03 &&
          fileBuffer[offset + 3] === 0x04
        ) {
          const compressionMethod = fileBuffer.readUInt16LE(offset + 8);
          const compressedSize = fileBuffer.readUInt32LE(offset + 18);
          const fileNameLen = fileBuffer.readUInt16LE(offset + 26);
          const extraFieldLen = fileBuffer.readUInt16LE(offset + 28);
          const fileName = fileBuffer.toString('utf-8', offset + 30, offset + 30 + fileNameLen);
          const dataStart = offset + 30 + fileNameLen + extraFieldLen;

          if (fileName === 'word/document.xml') {
            const compressedData = fileBuffer.subarray(dataStart, dataStart + compressedSize);
            const xmlData =
              compressionMethod === 8
                ? zlib.inflateRawSync(compressedData).toString('utf-8')
                : compressedData.toString('utf-8');

            const textMatches = xmlData.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || [];
            extracted = textMatches.map((m) => m.replace(/<[^>]+>/g, '')).join(' ');
            break;
          }
          offset = dataStart + compressedSize;
        } else {
          offset++;
        }
      }
    } catch {
      // Graceful fallback
    }
  } else {
    // 3. Plain text / Markdown
    extracted = fileBuffer.toString('utf-8');
  }

  // Strip null bytes and non-printable control characters while strictly preserving newlines (\r, \n) and tabs (\t)
  return extracted
    .replace(/\0/g, '')
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
}

/**
 * Upload and parse a resume file for a user.
 */
export async function uploadAndParseResume(
  userId: string,
  filename: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<{
  resume: ResumeMetadataDto;
  profile: CandidateProfileDto;
  syncResult?: SyncEvidenceResult;
  syncError?: string;
}> {
  const db = getDb();

  // Validate format, magic bytes, size, and MIME type
  const validated = validateResumeFile(filename, fileBuffer, mimeType);

  // Create private user storage directory
  const userStorageDir = path.join(RESUME_STORAGE_DIR, userId);
  if (!fs.existsSync(userStorageDir)) {
    fs.mkdirSync(userStorageDir, { recursive: true });
  }

  const resumeId = crypto.randomUUID();
  const storagePath = path.join(userStorageDir, `${resumeId}${validated.safeExt}`);

  // Write file to private storage
  fs.writeFileSync(storagePath, fileBuffer);

  // Extract raw text with format-specific extractor and null-byte sanitization
  const rawText = extractResumeText(fileBuffer, validated.safeExt);
  const parsedData = parseResumeText(rawText);

  // Mark all previous resumes as inactive
  let newResumeRecord: typeof schema.resumes.$inferSelect | null = null;

  await db.transaction(async (tx) => {
    // Acquire candidate-level advisory lock to serialize concurrent uploads for this user
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'resume_upload:' + userId}))`);

    await tx
      .update(schema.resumes)
      .set({ is_active: false, updated_at: new Date() })
      .where(eq(schema.resumes.user_id, userId));

    // Insert new active resume record (guaranteed 0 null bytes)
    const [insertedResume] = await tx
      .insert(schema.resumes)
      .values({
        id: resumeId,
        user_id: userId,
        filename: validated.sanitizedFilename,
        file_size: fileBuffer.length,
        mime_type: validated.canonicalMime,
        storage_path: storagePath,
        parsed_text: rawText.slice(0, 10000), // bounded preview without null bytes
        is_active: true,
      })
      .returning();
    newResumeRecord = insertedResume;

    // Upsert candidate profile
    const completeness = calculateProfileCompleteness({
      hasResume: true,
      skillsCount: parsedData.skills.length,
      educationsCount: parsedData.educations.length,
      projectsCount: parsedData.projects.length,
      experiencesCount: parsedData.experiences.length,
      hasPreferredRoles: parsedData.targetRoles.length > 0,
    });

    await tx
      .insert(schema.candidateProfiles)
      .values({
        user_id: userId,
        full_name: parsedData.fullName || null,
        headline: parsedData.headline || null,
        summary: parsedData.summary || null,
        primary_role: parsedData.primaryRole || null,
        target_roles: parsedData.targetRoles,
        experience_level: parsedData.experienceLevel,
        total_experience_months: parsedData.totalExperienceMonths,
        completeness_score: completeness.score,
      })
      .onConflictDoUpdate({
        target: [schema.candidateProfiles.user_id],
        set: {
          full_name: parsedData.fullName || null,
          headline: parsedData.headline || null,
          summary: parsedData.summary || null,
          primary_role: parsedData.primaryRole || null,
          target_roles: parsedData.targetRoles,
          experience_level: parsedData.experienceLevel,
          total_experience_months: parsedData.totalExperienceMonths,
          completeness_score: completeness.score,
          updated_at: new Date(),
        },
      });

    // Populate parsed skills (idempotent on canonical_name)
    for (const s of parsedData.skills) {
      await tx
        .insert(schema.candidateSkills)
        .values({
          user_id: userId,
          skill_name: s.skillName,
          canonical_name: s.canonicalName,
          category: s.category,
          source: 'PARSED',
        })
        .onConflictDoNothing();
    }

    // Populate educations with deterministic duplicate detection & non-destructive enrichment
    const existingEducations = await tx
      .select()
      .from(schema.candidateEducations)
      .where(eq(schema.candidateEducations.user_id, userId));

    for (const e of parsedData.educations) {
      const matchedExisting = existingEducations.find((ex) => isSameEducation(ex, e));

      if (matchedExisting) {
        // Existing qualification found. If parsed data provides richer details (e.g. non-generic institution or missing field/year), update non-destructively
        const updates: Partial<typeof schema.candidateEducations.$inferInsert> = {};
        const normMatchedInst = normalizeInstitution(matchedExisting.institution);
        const isGenericMatched = !normMatchedInst || normMatchedInst === 'university college' || normMatchedInst === 'university' || normMatchedInst === 'college';

        if (isGenericMatched && e.institution && normalizeInstitution(e.institution) !== 'university college') {
          updates.institution = e.institution;
        }
        if (!matchedExisting.field_of_study && e.fieldOfStudy) {
          updates.field_of_study = e.fieldOfStudy;
        }
        if (!matchedExisting.start_year && e.startYear) {
          updates.start_year = e.startYear;
        }
        if (!matchedExisting.end_year && e.endYear) {
          updates.end_year = e.endYear;
        }

        if (Object.keys(updates).length > 0) {
          await tx
            .update(schema.candidateEducations)
            .set(updates)
            .where(
              and(
                eq(schema.candidateEducations.id, matchedExisting.id),
                eq(schema.candidateEducations.user_id, userId)
              )
            );
        }
        // Deduplicated: do NOT insert duplicate row
      } else {
        // New distinct qualification: insert row and record into local list for subsequent entries
        const [inserted] = await tx
          .insert(schema.candidateEducations)
          .values({
            user_id: userId,
            institution: e.institution,
            degree: e.degree,
            field_of_study: e.fieldOfStudy || null,
            start_year: e.startYear || null,
            end_year: e.endYear || null,
          })
          .returning();

        if (inserted) {
          existingEducations.push(inserted);
        }
      }
    }

    // Populate projects
    for (const p of parsedData.projects) {
      await tx.insert(schema.candidateProjects).values({
        user_id: userId,
        title: p.title,
        description: p.description || null,
        technologies: p.technologies || null,
      });
    }

    // Populate certifications
    for (const c of parsedData.certifications) {
      await tx.insert(schema.candidateCertifications).values({
        user_id: userId,
        name: c.name,
        issuer: c.issuer || null,
        issue_year: c.issueYear || null,
      });
    }

    // Populate experiences
    for (const exp of parsedData.experiences) {
      await tx.insert(schema.candidateExperiences).values({
        user_id: userId,
        company_name: exp.companyName,
        title: exp.title,
        location: exp.location || null,
        is_internship: exp.isInternship,
        description: exp.description || null,
      });
    }

    // Recalculate deterministic profile completeness from real aggregate data in database
    const [finalSkills, finalEdus, finalProjs, finalExps] = await Promise.all([
      tx.select().from(schema.candidateSkills).where(eq(schema.candidateSkills.user_id, userId)),
      tx.select().from(schema.candidateEducations).where(eq(schema.candidateEducations.user_id, userId)),
      tx.select().from(schema.candidateProjects).where(eq(schema.candidateProjects.user_id, userId)),
      tx.select().from(schema.candidateExperiences).where(eq(schema.candidateExperiences.user_id, userId)),
    ]);

    const finalCompleteness = calculateProfileCompleteness({
      hasResume: true,
      skillsCount: finalSkills.length,
      educationsCount: finalEdus.length,
      projectsCount: finalProjs.length,
      experiencesCount: finalExps.length,
      hasPreferredRoles: parsedData.targetRoles.length > 0 || !!parsedData.headline,
    });

    await tx
      .update(schema.candidateProfiles)
      .set({
        completeness_score: finalCompleteness.score,
        updated_at: new Date(),
      })
      .where(eq(schema.candidateProfiles.user_id, userId));
  });

  // Auto-sync extracted profile items into Master Evidence Vault (Engine 3)
  let syncResult: SyncEvidenceResult | null = null;
  let syncError: string | null = null;
  try {
    syncResult = await syncProfileToEvidence(userId);
  } catch (syncErr: any) {
    // Retain full diagnostic info in protected server logs
    log.error({ err: syncErr?.message, stack: syncErr?.stack, userId }, 'AUTO_SYNC_EVIDENCE_FAILED');
    // Return sanitized, candidate-safe message without exposing raw SQL or stack traces
    syncError = 'Automatic evidence synchronization could not complete. You can safely retry syncing from your Evidence Vault without re-uploading.';
  }

  log.info({ userId, filename, skillsExtracted: parsedData.skills.length }, 'RESUME_UPLOADED_AND_PARSED');

  const updatedProfile = (await getCandidateProfile(userId))!;
  return {
    resume: formatResumeDto(newResumeRecord!),
    profile: updatedProfile,
    syncResult: syncResult ?? undefined,
    syncError: syncError ?? undefined,
  };
}

/**
 * List all resumes for a user.
 */
export async function listUserResumes(userId: string): Promise<ResumeMetadataDto[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.resumes)
    .where(eq(schema.resumes.user_id, userId))
    .orderBy(desc(schema.resumes.created_at));

  return rows.map(formatResumeDto);
}

/**
 * Set an active resume for a user.
 */
export async function setActiveResume(userId: string, resumeId: string): Promise<void> {
  const db = getDb();

  await db
    .update(schema.resumes)
    .set({ is_active: false, updated_at: new Date() })
    .where(eq(schema.resumes.user_id, userId));

  await db
    .update(schema.resumes)
    .set({ is_active: true, updated_at: new Date() })
    .where(and(eq(schema.resumes.user_id, userId), eq(schema.resumes.id, resumeId)));
}

/**
 * Delete a resume record and remove the file from private storage.
 */
export async function deleteResume(userId: string, resumeId: string): Promise<boolean> {
  const db = getDb();

  const [record] = await db
    .select()
    .from(schema.resumes)
    .where(and(eq(schema.resumes.user_id, userId), eq(schema.resumes.id, resumeId)))
    .limit(1);

  if (!record) return false;

  if (fs.existsSync(record.storage_path)) {
    try {
      fs.unlinkSync(record.storage_path);
    } catch (err: any) {
      log.warn({ err: err.message }, 'Failed to unlink physical resume file');
    }
  }

  await db
    .delete(schema.resumes)
    .where(and(eq(schema.resumes.user_id, userId), eq(schema.resumes.id, resumeId)));

  // Recalculate and update profile completeness score
  const [profileRecord] = await db
    .select()
    .from(schema.candidateProfiles)
    .where(eq(schema.candidateProfiles.user_id, userId))
    .limit(1);

  if (profileRecord) {
    const [skillsRows, eduRows, projRows, expRows, activeResumes] = await Promise.all([
      db.select().from(schema.candidateSkills).where(eq(schema.candidateSkills.user_id, userId)),
      db.select().from(schema.candidateEducations).where(eq(schema.candidateEducations.user_id, userId)),
      db.select().from(schema.candidateProjects).where(eq(schema.candidateProjects.user_id, userId)),
      db.select().from(schema.candidateExperiences).where(eq(schema.candidateExperiences.user_id, userId)),
      db
        .select()
        .from(schema.resumes)
        .where(and(eq(schema.resumes.user_id, userId), eq(schema.resumes.is_active, true)))
        .limit(1),
    ]);

    const targetRoles = (profileRecord?.target_roles as string[]) || [];
    const completeness = calculateProfileCompleteness({
      hasResume: activeResumes.length > 0,
      skillsCount: skillsRows.length,
      educationsCount: eduRows.length,
      projectsCount: projRows.length,
      experiencesCount: expRows.length,
      hasPreferredRoles: targetRoles.length > 0 || !!profileRecord?.headline,
    });

    await db
      .update(schema.candidateProfiles)
      .set({
        completeness_score: completeness.score,
        updated_at: new Date(),
      })
      .where(eq(schema.candidateProfiles.user_id, userId));
  }

  log.info({ userId, resumeId }, 'RESUME_DELETED');
  return true;
}

function formatResumeDto(r: typeof schema.resumes.$inferSelect): ResumeMetadataDto {
  return {
    id: r.id,
    userId: r.user_id,
    filename: r.filename,
    fileSize: r.file_size,
    mimeType: r.mime_type,
    isActive: r.is_active,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}
