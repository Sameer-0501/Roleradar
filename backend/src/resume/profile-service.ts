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
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { parseResumeText } from './resume-parser.js';
import { createLogger } from '../utils/logger.js';
import type {
  CandidateProfileDto,
  ResumeMetadataDto,
  ProfileCompletenessBreakdown,
} from './resume-types.js';

const log = createLogger('resume:profile-service');

const RESUME_STORAGE_DIR = path.resolve(process.cwd(), 'storage', 'resumes');

// Ensure base private storage directory exists
if (!fs.existsSync(RESUME_STORAGE_DIR)) {
  fs.mkdirSync(RESUME_STORAGE_DIR, { recursive: true });
}

/**
 * Calculate deterministic profile completeness score (0–100%).
 */
export function calculateProfileCompleteness(params: {
  hasResume: boolean;
  skillsCount: number;
  educationsCount: number;
  projectsCount: number;
  experiencesCount: number;
  hasPreferredRoles: boolean;
}): ProfileCompletenessBreakdown {
  let score = 0;
  const actionableTips: string[] = [];

  // 1. Resume uploaded (+15 pts)
  if (params.hasResume) {
    score += 15;
  } else {
    actionableTips.push('Upload a PDF or DOCX resume for automated parsing (+15%)');
  }

  // 2. Verified Skills (+25 pts for >= 3 skills, +15 pts for 1-2 skills)
  if (params.skillsCount >= 3) {
    score += 25;
  } else if (params.skillsCount >= 1) {
    score += 15;
    actionableTips.push('Add at least 3 core technical or domain skills (+10%)');
  } else {
    actionableTips.push('Add your key skills to boost matching accuracy (+25%)');
  }

  // 3. Education history (+20 pts)
  if (params.educationsCount >= 1) {
    score += 20;
  } else {
    actionableTips.push('Add your degree or highest education details (+20%)');
  }

  // 4. Projects (+15 pts)
  if (params.projectsCount >= 1) {
    score += 15;
  } else {
    actionableTips.push('Add at least 1 key academic or portfolio project (+15%)');
  }

  // 5. Experience or Internships (+15 pts)
  if (params.experiencesCount >= 1) {
    score += 15;
  } else {
    actionableTips.push('Add your work or internship experience (+15%)');
  }

  // 6. Preferred Roles & Headline (+10 pts)
  if (params.hasPreferredRoles) {
    score += 10;
  } else {
    actionableTips.push('Define your target role or professional headline (+10%)');
  }

  return {
    score: Math.min(100, Math.max(0, score)),
    hasResume: params.hasResume,
    hasSkills: params.skillsCount > 0,
    skillsCount: params.skillsCount,
    hasEducation: params.educationsCount > 0,
    hasProjects: params.projectsCount > 0,
    hasExperienceOrInternship: params.experiencesCount > 0,
    hasPreferredRoles: params.hasPreferredRoles,
    actionableTips,
  };
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
 * Upload and parse a resume file for a user.
 */
export async function uploadAndParseResume(
  userId: string,
  filename: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<{ resume: ResumeMetadataDto; profile: CandidateProfileDto }> {
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

  // Extract raw text (plain text conversion or buffer decoding)
  const rawText = fileBuffer.toString('utf-8');
  const parsedData = parseResumeText(rawText);

  // Mark all previous resumes as inactive
  await db
    .update(schema.resumes)
    .set({ is_active: false, updated_at: new Date() })
    .where(eq(schema.resumes.user_id, userId));

  // Insert new active resume record
  const [newResume] = await db
    .insert(schema.resumes)
    .values({
      id: resumeId,
      user_id: userId,
      filename: validated.sanitizedFilename,
      file_size: fileBuffer.length,
      mime_type: validated.canonicalMime,
      storage_path: storagePath,
      parsed_text: rawText.slice(0, 10000), // bounded preview
      is_active: true,
    })
    .returning();

  // Upsert candidate profile
  const completeness = calculateProfileCompleteness({
    hasResume: true,
    skillsCount: parsedData.skills.length,
    educationsCount: parsedData.educations.length,
    projectsCount: parsedData.projects.length,
    experiencesCount: parsedData.experiences.length,
    hasPreferredRoles: parsedData.targetRoles.length > 0,
  });

  await db
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
    await db
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

  // Populate educations
  for (const e of parsedData.educations) {
    await db.insert(schema.candidateEducations).values({
      user_id: userId,
      institution: e.institution,
      degree: e.degree,
      field_of_study: e.fieldOfStudy || null,
      start_year: e.startYear || null,
      end_year: e.endYear || null,
    });
  }

  // Populate projects
  for (const p of parsedData.projects) {
    await db.insert(schema.candidateProjects).values({
      user_id: userId,
      title: p.title,
      description: p.description || null,
      technologies: p.technologies || null,
    });
  }

  // Populate certifications
  for (const c of parsedData.certifications) {
    await db.insert(schema.candidateCertifications).values({
      user_id: userId,
      name: c.name,
      issuer: c.issuer || null,
      issue_year: c.issueYear || null,
    });
  }

  // Populate experiences
  for (const exp of parsedData.experiences) {
    await db.insert(schema.candidateExperiences).values({
      user_id: userId,
      company_name: exp.companyName,
      title: exp.title,
      location: exp.location || null,
      is_internship: exp.isInternship,
      description: exp.description || null,
    });
  }

  log.info({ userId, filename, skillsExtracted: parsedData.skills.length }, 'RESUME_UPLOADED_AND_PARSED');

  const updatedProfile = (await getCandidateProfile(userId))!;
  return {
    resume: formatResumeDto(newResume!),
    profile: updatedProfile,
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
