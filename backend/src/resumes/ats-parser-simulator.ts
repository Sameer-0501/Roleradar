/**
 * Machine Extraction Inspection Simulator — Engine 3.
 *
 * Simulates enterprise ATS resume parsing and audits document health across:
 * 1. Parsing Quality (Contact extraction, standard section header detection, text layout).
 * 2. Role Relevance (Keyword alignment, density, and target requirement overlap).
 * 3. Evidence Integrity (Truth-preserving claim audit, unlinked bullet detection).
 *
 * Implements Blueprint Section 6.6 without external proprietary APIs.
 */

import { extractKeywords } from './resume-tailoring-service.js';

export interface ParsingQualityResult {
  score: number; // 0–100%
  status: 'EXCELLENT' | 'ACCEPTABLE' | 'NEEDS_IMPROVEMENT';
  contactDetails: {
    nameDetected: string | null;
    emailDetected: string | null;
    phoneDetected: string | null;
    linksDetected: string[];
  };
  detectedSections: Array<{
    sectionName: string;
    lineIndex: number;
    standardCategory: 'EXPERIENCE' | 'EDUCATION' | 'SKILLS' | 'PROJECTS' | 'CERTIFICATIONS' | 'SUMMARY';
  }>;
  missingSections: string[];
  diagnostics: string[];
}

export interface RoleRelevanceResult {
  score: number; // 0–100%
  status: 'HIGH' | 'MODERATE' | 'LOW';
  matchedKeywords: string[];
  missingKeywords: string[];
  keywordDensityPercent: number;
  recommendations: string[];
}

export interface EvidenceIntegrityResult {
  score: number; // 0–100%
  status: 'VERIFIED' | 'ACCEPTABLE_SYNTHESIS' | 'UNVERIFIED_CLAIMS_DETECTED';
  totalClaimsCount: number;
  provenanceBackedCount: number;
  unlinkedCount: number;
  unlinkedBullets: string[];
  integrityFlags: string[];
}

export interface ATSInspectionReportDto {
  evaluatedAt: string;
  overallHealthStatus: 'HEALTHY' | 'ACTION_RECOMMENDED' | 'CRITICAL_GAPS';
  overallScore: number; // 0–100%
  parsingQuality: ParsingQualityResult;
  roleRelevance: RoleRelevanceResult;
  evidenceIntegrity: EvidenceIntegrityResult;
  dimensions: {
    parsingQuality: ParsingQualityResult;
    roleRelevance: RoleRelevanceResult;
    evidenceIntegrity: EvidenceIntegrityResult;
  };
}

export interface InspectParseInput {
  resumeText: string;
  targetJobText?: string | null;
  bullets?: Array<{
    bulletText: string;
    provenanceState: 'PROVENANCE_BACKED' | 'UNLINKED';
  }>;
}

const STANDARD_SECTION_PATTERNS: Array<{
  name: string;
  regex: RegExp;
  category: 'EXPERIENCE' | 'EDUCATION' | 'SKILLS' | 'PROJECTS' | 'CERTIFICATIONS' | 'SUMMARY';
}> = [
  { name: 'Summary', regex: /^(?:professional\s+summary|summary|profile|about\s+me)\b/i, category: 'SUMMARY' },
  { name: 'Experience', regex: /^(?:experience|work\s+experience|employment\s+history|work\s+history|internships?)\b/i, category: 'EXPERIENCE' },
  { name: 'Education', regex: /^(?:education|academic\s+background|qualifications)\b/i, category: 'EDUCATION' },
  { name: 'Skills', regex: /^(?:skills|technical\s+skills|core\s+competencies|technologies)\b/i, category: 'SKILLS' },
  { name: 'Projects', regex: /^(?:projects|academic\s+projects|portfolio|key\s+projects)\b/i, category: 'PROJECTS' },
  { name: 'Certifications', regex: /^(?:certifications?|licenses|courses)\b/i, category: 'CERTIFICATIONS' },
];

/**
 * Dimension 1: Parsing Quality Simulator
 */
export function simulateParsingQuality(resumeText: string): ParsingQualityResult {
  const lines = resumeText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  const emailMatch = resumeText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  const phoneMatch = resumeText.match(/(?:\+?\d{1,3}[-.\s]?)?(\d{5}[-.\s]?\d{5}|\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\d{10})\b/);
  const linkMatches = resumeText.match(/https?:\/\/[^\s)]+|github\.com\/[^\s)]+|linkedin\.com\/in\/[^\s)]+/gi) || [];

  let nameDetected: string | null = null;
  if (lines.length > 0) {
    const firstCandidate = lines[0]!;
    if (firstCandidate.length < 50 && !firstCandidate.includes('@') && !firstCandidate.match(/\d{5,}/)) {
      nameDetected = firstCandidate.replace(/[^a-zA-Z\s.-]/g, '').trim();
    }
  }

  const detectedSections: ParsingQualityResult['detectedSections'] = [];
  const recognizedCategories = new Set<string>();

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]!;
    for (const sec of STANDARD_SECTION_PATTERNS) {
      if (sec.regex.test(line) && !recognizedCategories.has(sec.category)) {
        detectedSections.push({
          sectionName: sec.name,
          lineIndex: idx,
          standardCategory: sec.category,
        });
        recognizedCategories.add(sec.category);
      }
    }
  }

  const allCategories = ['EXPERIENCE', 'EDUCATION', 'SKILLS', 'PROJECTS'];
  const missingSections = allCategories
    .filter((cat) => !recognizedCategories.has(cat))
    .map((cat) => cat.charAt(0) + cat.slice(1).toLowerCase());

  const diagnostics: string[] = [];
  let qualityPoints = 0;

  if (emailMatch) qualityPoints += 25;
  else diagnostics.push('No valid email address detected in text stream.');

  if (phoneMatch) qualityPoints += 15;
  else diagnostics.push('No telephone number identified.');

  if (nameDetected) qualityPoints += 20;
  else diagnostics.push('Candidate name could not be definitively isolated at head of document.');

  const sectionRatio = detectedSections.length / allCategories.length;
  qualityPoints += Math.min(40, Math.round(sectionRatio * 40));

  if (missingSections.length > 0) {
    diagnostics.push(`ATS standard headers missing or unseparated: ${missingSections.join(', ')}.`);
  }

  return {
    score: Math.min(100, qualityPoints),
    status: qualityPoints >= 80 ? 'EXCELLENT' : qualityPoints >= 55 ? 'ACCEPTABLE' : 'NEEDS_IMPROVEMENT',
    contactDetails: {
      nameDetected,
      emailDetected: emailMatch ? emailMatch[0] : null,
      phoneDetected: phoneMatch ? phoneMatch[0] : null,
      linksDetected: Array.from(new Set(linkMatches)),
    },
    detectedSections,
    missingSections,
    diagnostics,
  };
}

/**
 * Dimension 2: Role Relevance Simulator
 */
export function simulateRoleRelevance(resumeText: string, targetJobText?: string | null): RoleRelevanceResult {
  if (!targetJobText || !targetJobText.trim()) {
    return {
      score: 100,
      status: 'HIGH',
      matchedKeywords: [],
      missingKeywords: [],
      keywordDensityPercent: 0,
      recommendations: ['Select or paste a target Job Description to benchmark keyword relevance.'],
    };
  }

  const resumeWords = extractKeywords(resumeText);
  const jobWords = extractKeywords(targetJobText);

  const matched: string[] = [];
  const missing: string[] = [];

  for (const jw of jobWords) {
    if (resumeWords.has(jw)) {
      matched.push(jw);
    } else {
      missing.push(jw);
    }
  }

  const overlapRatio = jobWords.size > 0 ? matched.length / jobWords.size : 1;
  const relevanceScore = Math.min(100, Math.round(overlapRatio * 100));
  const densityPercent = resumeWords.size > 0 ? Math.round((matched.length / resumeWords.size) * 100) : 0;

  const recommendations: string[] = [];
  if (missing.length > 0) {
    recommendations.push(
      `High-impact target job keywords absent from resume: ${missing.slice(0, 6).join(', ')}.`
    );
  }
  if (relevanceScore < 60) {
    recommendations.push('Consider emphasizing additional relevant coursework or projects targeting this role.');
  }

  return {
    score: relevanceScore,
    status: relevanceScore >= 70 ? 'HIGH' : relevanceScore >= 45 ? 'MODERATE' : 'LOW',
    matchedKeywords: matched.slice(0, 20),
    missingKeywords: missing.slice(0, 15),
    keywordDensityPercent: densityPercent,
    recommendations,
  };
}

/**
 * Dimension 3: Evidence Integrity Simulator
 */
export function simulateEvidenceIntegrity(
  bullets: Array<{ bulletText: string; provenanceState: 'PROVENANCE_BACKED' | 'UNLINKED' }>
): EvidenceIntegrityResult {
  const totalClaims = bullets.length;
  const provenanceBacked = bullets.filter((b) => b.provenanceState === 'PROVENANCE_BACKED').length;
  const unlinked = totalClaims - provenanceBacked;
  const unlinkedBullets = bullets.filter((b) => b.provenanceState === 'UNLINKED').map((b) => b.bulletText);

  let integrityScore = 100;
  const integrityFlags: string[] = [];

  if (totalClaims > 0) {
    integrityScore = Math.round((provenanceBacked / totalClaims) * 100);
    if (unlinked > 0) {
      integrityFlags.push(
        `${unlinked} resume bullet(s) lack direct link to a Master Career Evidence claim (tagged UNLINKED).`
      );
    }
  } else {
    integrityFlags.push('Document contains no atomized resume bullets for provenance evaluation.');
  }

  return {
    score: integrityScore,
    status: integrityScore >= 80 ? 'VERIFIED' : integrityScore >= 50 ? 'ACCEPTABLE_SYNTHESIS' : 'UNVERIFIED_CLAIMS_DETECTED',
    totalClaimsCount: totalClaims,
    provenanceBackedCount: provenanceBacked,
    unlinkedCount: unlinked,
    unlinkedBullets,
    integrityFlags,
  };
}

/**
 * Simulates ATS parser extraction and audits document quality across 3 dimensions.
 */
export function inspectResumeParseQuality(input: InspectParseInput): ATSInspectionReportDto {
  const { resumeText, targetJobText, bullets = [] } = input;

  const parsingQuality = simulateParsingQuality(resumeText);
  const roleRelevance = simulateRoleRelevance(resumeText, targetJobText);
  const evidenceIntegrity = simulateEvidenceIntegrity(bullets);

  const overallScore = Math.round(
    parsingQuality.score * 0.35 +
    roleRelevance.score * 0.35 +
    evidenceIntegrity.score * 0.30
  );

  const overallHealthStatus =
    overallScore >= 75 && parsingQuality.status !== 'NEEDS_IMPROVEMENT'
      ? 'HEALTHY'
      : overallScore >= 50
      ? 'ACTION_RECOMMENDED'
      : 'CRITICAL_GAPS';

  return {
    evaluatedAt: new Date().toISOString(),
    overallHealthStatus,
    overallScore,
    parsingQuality,
    roleRelevance,
    evidenceIntegrity,
    dimensions: {
      parsingQuality,
      roleRelevance,
      evidenceIntegrity,
    },
  };
}
