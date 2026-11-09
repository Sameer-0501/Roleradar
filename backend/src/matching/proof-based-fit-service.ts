/**
 * Engine 2: Proof-Based Job Fit Service (RoleRadar Job Fit Intelligence).
 *
 * Implements Blueprint Section 5 ("Engine 2 — Proof-Based Job Fit") and
 * docs/ENGINEERING_STANDARDS.md.
 *
 * CRITICAL INVARIANTS:
 * 1. Zero Artificial Percentage Scores: Never compress requirements into an ungrounded
 *    single percentage match score (e.g. "87% genuine" or "92% match").
 * 2. Grounded Evidence Traceability: Every requirement evaluation must be backed by
 *    concrete candidate evidence (PROJECT, EXPERIENCE, EDUCATION, CERTIFICATION, PROFILE_SKILL, PREFERENCE).
 * 3. Exact 6-State Evaluation Vocabulary:
 *    - SUPPORTED: Direct candidate evidence exists.
 *    - PARTIALLY_SUPPORTED: Adjacent/transferable evidence exists.
 *    - NOT_SUPPORTED: Learnable skill or tool gap.
 *    - UNKNOWN: Information has not yet been entered by candidate (NEVER an automatic rejection).
 *    - HARD_ELIGIBILITY_CONCERN: Non-negotiable experience, location, or boundary conflict.
 *    - NOT_APPLICABLE: Non-constraining condition.
 * 4. Separation of Concerns: Clear separation of Mandatory Requirements, Preferred Requirements,
 *    Responsibilities, and Employment Conditions.
 * 5. Candidate Agency: Candidates can dispute misclassifications and clarify unknown items without
 *    mutating global job records or falsifying candidate profile history.
 */

import { eq, and } from 'drizzle-orm';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { SKILL_SYNONYMS } from '../search/search-parser.js';
import { parseExperienceRequirements } from './experience-parser.js';
import { parseCompensationDisclosure } from '../trust/trust-passport-service.js';
import { createLogger } from '../utils/logger.js';
import type { CandidateProfileDto } from '../resume/resume-types.js';

const log = createLogger('matching:proof-based-fit');

// ─── Types & Contracts (Blueprint Section 5.3 & 5.4) ─────────────────────────

export type AssessmentState =
  | 'SUPPORTED'
  | 'PARTIALLY_SUPPORTED'
  | 'NOT_SUPPORTED'
  | 'UNKNOWN'
  | 'HARD_ELIGIBILITY_CONCERN'
  | 'NOT_APPLICABLE';

export type EvidenceSource =
  | 'PROJECT'
  | 'EXPERIENCE'
  | 'EDUCATION'
  | 'CERTIFICATION'
  | 'PROFILE_SKILL'
  | 'PREFERENCE'
  | 'CLARIFICATION';

export type RequirementGroup = 'MANDATORY' | 'PREFERRED' | 'RESPONSIBILITY' | 'CONDITION';

export type RequirementCategory =
  | 'EDUCATION'
  | 'EXPERIENCE'
  | 'TECHNICAL_SKILL'
  | 'CERTIFICATION'
  | 'LOCATION'
  | 'WORKPLACE_TYPE'
  | 'DOMAIN_KNOWLEDGE';

export interface RequirementEvaluation {
  id: string;
  group: RequirementGroup;
  category: RequirementCategory;
  originalText: string;
  extractedCriterion: string;
  assessmentState: AssessmentState;
  evidenceSource?: EvidenceSource;
  evidenceSummary?: string;
  isDisputed?: boolean;
  disputeReason?: string;
  candidateNote?: string;
  candidateClarification?: string;
}

export interface EmploymentConditions {
  workLocation: string | null;
  workplaceMode: 'ONSITE' | 'HYBRID' | 'REMOTE' | 'UNKNOWN';
  countryBoundary: string | null;
  contractType: string | null;
  disclosedSalary: {
    status: 'EMPLOYER_DISCLOSED' | 'UNSTATED_BY_EMPLOYER';
    rawCompensation: string | null;
    note?: string;
  };
}

export interface EligibilityBlocker {
  requirementId: string;
  criterion: string;
  candidateReality: string;
  reason: string;
}

export interface LearnableSkillGap {
  requirementId: string;
  skillName: string;
  importance: 'MANDATORY' | 'PREFERRED';
  recommendedAction: string;
}

export interface UnknownItem {
  requirementId: string;
  criterion: string;
  missingField: string;
  actionPrompt: string;
}

export interface CandidateFitControls {
  disputedRequirements?: Array<{
    requirementId: string;
    reason: string;
    candidateNote?: string;
    disputedAt: string;
  }>;
  suppliedClarifications?: Array<{
    requirementId: string;
    clarification: string;
    value?: string;
    suppliedAt: string;
  }>;
}

export interface ProofBasedJobFitAnalysis {
  jobId: string;
  userId: string;
  overallEligibilityStatus: 'ELIGIBLE' | 'ELIGIBILITY_CONCERN_DETECTED' | 'NEEDS_PROFILE_COMPLETION';
  mandatoryEvaluations: RequirementEvaluation[];
  preferredEvaluations: RequirementEvaluation[];
  responsibilities: string[];
  employmentConditions: EmploymentConditions;
  eligibilityBlockers: EligibilityBlocker[];
  learnableSkillGaps: LearnableSkillGap[];
  unknownItems: UnknownItem[];
  candidateControlsApplied: {
    disputesCount: number;
    clarificationsCount: number;
  };
  generatedAt: string;
}

// ─── Adjacent Technology Map (Transferable Evidence) ─────────────────────────

export const ADJACENT_TECH_MAP: Record<string, string[]> = {
  React: ['React Native', 'Next.js', 'Vue', 'Angular', 'TypeScript', 'JavaScript'],
  'React Native': ['React', 'Mobile Development', 'Flutter', 'iOS', 'Android'],
  'Node.js': ['Express', 'NestJS', 'Fastify', 'TypeScript', 'JavaScript', 'Koa'],
  TypeScript: ['JavaScript', 'React', 'Node.js', 'Angular'],
  Python: ['Django', 'FastAPI', 'Flask', 'Pandas', 'NumPy'],
  Java: ['Spring Boot', 'Spring', 'Kotlin', 'Hibernate'],
  'C++': ['C', 'Rust', 'Systems Programming'],
  Go: ['Distributed Systems', 'Kubernetes', 'Docker', 'Microservices'],
  Docker: ['Kubernetes', 'Podman', 'Containerization', 'CI/CD'],
  Kubernetes: ['Docker', 'Helm', 'Cloud Infrastructure', 'DevOps'],
  AWS: ['Cloud Infrastructure', 'GCP', 'Azure', 'Terraform'],
  GCP: ['Cloud Infrastructure', 'AWS', 'Azure', 'Terraform'],
  Azure: ['Cloud Infrastructure', 'AWS', 'GCP', 'DevOps'],
  PostgreSQL: ['MySQL', 'SQL', 'Relational Databases', 'Database Design'],
  MongoDB: ['NoSQL', 'Document Databases', 'Redis', 'Cassandra'],
};

// ─── Structured Requirement Extractor (Blueprint Section 5.2) ────────────────

export interface ExtractedJobRequirements {
  mandatorySkills: string[];
  preferredSkills: string[];
  minYearsExperience: number | null;
  experiencePhrase: string | null;
  isFresherCompatible: boolean;
  requiredEducation: {
    degreeLevel: 'BACHELOR' | 'MASTER' | 'PHD' | 'ANY_DEGREE';
    fieldOfStudy: string | null;
    rawText: string;
  } | null;
  responsibilities: string[];
  employmentConditions: EmploymentConditions;
}

/**
 * Deterministically extracts requirements and conditions from verified job fields.
 */
export function extractJobRequirements(job: {
  title: string;
  description?: string | null;
  requirements?: string | null;
  roleCategory?: string | null;
  experienceLevel?: string | null;
  location?: string | null;
  country?: string | null;
  workplaceType?: string | null;
  employmentType?: string | null;
  rawMetadata?: unknown;
}): ExtractedJobRequirements {
  const fullText = `${job.title}\n${job.description || ''}\n${job.requirements || ''}`;
  const lowerText = fullText.toLowerCase();

  // Normalize section delimiters so inline markers like "Preferred: ..." are cleanly separated
  const normalizedText = fullText
    .replace(/(?:^|[.;\n])\s*(?:preferred\s+qualifications|preferred\s+skills|preferred|nice\s+to\s+have|bonus\s+points|plus\s+if|desired\s+qualifications|what\s+sets\s+you\s+apart)\b[^\n:]*:?/gi, '\n---SECTION_PREFERRED---\n')
    .replace(/(?:^|[.;\n])\s*(?:responsibilities|what\s+you(?:'ll|\s+will)\s+do|your\s+role|daily\s+tasks|duties|what\s+you\s+bring)\b[^\n:]*:?/gi, '\n---SECTION_RESPONSIBILITIES---\n')
    .replace(/(?:^|[.;\n])\s*(?:requirements|qualifications|what\s+you\s+need|who\s+you\s+are|basic\s+qualifications|minimum\s+qualifications|must\s+have)\b[^\n:]*:?/gi, '\n---SECTION_QUALIFICATIONS---\n');

  // 1. Separate sections: Qualifications vs Preferred vs Responsibilities
  const lines = normalizedText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let currentSection: 'QUALIFICATIONS' | 'PREFERRED' | 'RESPONSIBILITIES' | 'GENERAL' = 'GENERAL';
  const qualificationLines: string[] = [];
  const preferredLines: string[] = [];
  const responsibilityLines: string[] = [];

  for (const line of lines) {
    if (line === '---SECTION_PREFERRED---') {
      currentSection = 'PREFERRED';
      continue;
    } else if (line === '---SECTION_RESPONSIBILITIES---') {
      currentSection = 'RESPONSIBILITIES';
      continue;
    } else if (line === '---SECTION_QUALIFICATIONS---') {
      currentSection = 'QUALIFICATIONS';
      continue;
    }

    if (currentSection === 'PREFERRED') {
      preferredLines.push(line);
    } else if (currentSection === 'RESPONSIBILITIES') {
      responsibilityLines.push(line);
    } else if (currentSection === 'QUALIFICATIONS') {
      qualificationLines.push(line);
    }
  }

  // Fallback: If no explicit sections were parsed, populate qualifications from requirements text
  if (qualificationLines.length === 0 && job.requirements) {
    qualificationLines.push(
      ...job.requirements
        .split(/[.\n;]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 5)
    );
  }

  // 2. Extract technical skills
  const mandatorySkills: string[] = [];
  const preferredSkills: string[] = [];
  const qualText = qualificationLines.join('\n').toLowerCase();
  const prefText = preferredLines.join('\n').toLowerCase();

  for (const [skillKey, canonical] of Object.entries(SKILL_SYNONYMS)) {
    if (skillKey === 'go') {
      if (/\b(golang|go\s+developer|go\s+engineer|go\s+backend|expertise\s+in\s+go|in\s+go|with\s+go|knowledge\s+of\s+go|\bgo\b(?=\s*[,/&]))\b/i.test(lowerText)) {
        if (prefText.includes('golang') || /\bgo\b/i.test(prefText)) {
          if (!preferredSkills.includes('Go')) preferredSkills.push('Go');
        } else {
          if (!mandatorySkills.includes('Go')) mandatorySkills.push('Go');
        }
      }
      continue;
    }

    const regex = new RegExp(`\\b${skillKey.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    if (regex.test(prefText)) {
      if (!preferredSkills.includes(canonical)) preferredSkills.push(canonical);
    } else if (regex.test(qualText) || (qualificationLines.length === 0 && regex.test(lowerText))) {
      if (!mandatorySkills.includes(canonical)) mandatorySkills.push(canonical);
    }
  }

  // 3. Extract Experience
  const expParsed = parseExperienceRequirements(job.title, job.description, job.requirements);
  let minYearsExperience: number | null = expParsed.minYears ?? null;
  let experiencePhrase: string | null = expParsed.matchedPhrase ?? null;
  const isFresherCompatible =
    expParsed.classification === 'FRESHER_COMPATIBLE' ||
    expParsed.classification === 'BOTH' ||
    /\b(fresher|entry\s*level|graduate|intern|trainee|junior|associate)\b/i.test(job.title.toLowerCase());

  if (minYearsExperience === null && isFresherCompatible) {
    minYearsExperience = 0;
  }

  // 4. Extract Education
  let requiredEducation: ExtractedJobRequirements['requiredEducation'] = null;
  const degreeMatch = fullText.match(
    /\b(bachelor(?:'s)?|b\.?s\.?|b\.?tech|b\.?e\.?|master(?:'s)?|m\.?s\.?|m\.?tech|ph\.?d\.?|doctorate|degree\s+in)\s+(?:degree\s+)?(?:in\s+)?([a-zA-Z\s,]+(?:computer\s+science|engineering|information\s+technology|data\s+science|mathematics|related\s+field))/i
  );

  if (degreeMatch) {
    const rawDeg = degreeMatch[1]!.toLowerCase();
    const field = degreeMatch[2]!.trim();
    let level: 'BACHELOR' | 'MASTER' | 'PHD' | 'ANY_DEGREE' = 'BACHELOR';
    if (/master|m\.?s|m\.?tech/i.test(rawDeg)) level = 'MASTER';
    if (/ph\.?d|doctorate/i.test(rawDeg)) level = 'PHD';

    requiredEducation = {
      degreeLevel: level,
      fieldOfStudy: field,
      rawText: degreeMatch[0],
    };
  } else if (/\b(bachelor(?:'s)?|master(?:'s)?|degree\s+in\s+computer\s+science)\b/i.test(lowerText)) {
    requiredEducation = {
      degreeLevel: /master/i.test(lowerText) ? 'MASTER' : 'BACHELOR',
      fieldOfStudy: 'Computer Science or related field',
      rawText: 'Bachelor degree in Computer Science or related field',
    };
  }

  // 5. Responsibilities
  const responsibilities = responsibilityLines
    .map((r) => r.replace(/^[-*•\d.]\s*/, '').trim())
    .filter((r) => r.length > 10)
    .slice(0, 10);

  if (responsibilities.length === 0) {
    // Extract key action sentences from description
    const actionSentences = (job.description || '')
      .split(/[.\n]/)
      .map((s) => s.trim())
      .filter((s) => /^(?:build|design|develop|create|maintain|lead|collaborate|implement|architect|own)\b/i.test(s))
      .slice(0, 5);
    responsibilities.push(...actionSentences);
  }

  // 6. Employment Conditions
  const compensation = parseCompensationDisclosure(job.description, job.requirements);
  const conditions: EmploymentConditions = {
    workLocation: job.location || null,
    workplaceMode: (job.workplaceType as any) || 'UNKNOWN',
    countryBoundary: job.country || deriveCountryFromLocation(job.location),
    contractType: job.employmentType || 'FULL_TIME',
    disclosedSalary: {
      status: compensation.status,
      rawCompensation: compensation.value,
      note: compensation.note,
    },
  };

  return {
    mandatorySkills,
    preferredSkills,
    minYearsExperience,
    experiencePhrase,
    isFresherCompatible,
    requiredEducation,
    responsibilities,
    employmentConditions: conditions,
  };
}

/**
 * Infers country boundary from location string.
 */
function deriveCountryFromLocation(location?: string | null): string | null {
  if (!location) return null;
  const l = location.toLowerCase();
  if (/\b(india|bangalore|bengaluru|hyderabad|pune|mumbai|delhi|noida|chennai|gurgaon|gurugram)\b/.test(l)) {
    return 'India';
  }
  if (/\b(united\s+states|usa|u\.s\.a\.|u\.s\.|san\s+francisco|new\s+york|seattle|austin|california)\b/.test(l)) {
    return 'United States';
  }
  if (/\b(united\s+kingdom|uk|london|manchester)\b/.test(l)) {
    return 'United Kingdom';
  }
  return null;
}

// ─── Deterministic Requirement Evaluator (Blueprint Section 5.3) ──────────────

export interface CandidateContext {
  profile?: CandidateProfileDto | null;
  skills: Array<{ canonicalName: string; skillName: string }>;
  educations: Array<{ degree: string; fieldOfStudy?: string | null; institution: string }>;
  projects: Array<{ title: string; description?: string | null; technologies?: unknown }>;
  experiences: Array<{
    title: string;
    companyName: string;
    description?: string | null;
    isInternship?: boolean;
    startDate?: Date | null;
    endDate?: Date | null;
  }>;
  preferences?: {
    locations?: string[];
    workplace_types?: string[];
    roles?: string[];
    experience_level?: string;
  } | null;
  fitControls?: CandidateFitControls | null;
}

/**
 * Evaluates extracted requirements against candidate evidence.
 */
export function evaluateProofBasedJobFit(params: {
  jobId: string;
  userId: string;
  job: {
    title: string;
    description?: string | null;
    requirements?: string | null;
    roleCategory?: string | null;
    experienceLevel?: string | null;
    location?: string | null;
    country?: string | null;
    workplaceType?: string | null;
    employmentType?: string | null;
    rawMetadata?: unknown;
  };
  candidate: CandidateContext;
}): ProofBasedJobFitAnalysis {
  const { jobId, userId, job, candidate } = params;
  const extracted = extractJobRequirements(job);

  const mandatoryEvaluations: RequirementEvaluation[] = [];
  const preferredEvaluations: RequirementEvaluation[] = [];
  const eligibilityBlockers: EligibilityBlocker[] = [];
  const learnableSkillGaps: LearnableSkillGap[] = [];
  const unknownItems: UnknownItem[] = [];

  const candidateSkillsSet = new Set(
    candidate.skills.map((s) => s.canonicalName.toLowerCase()).concat(candidate.skills.map((s) => s.skillName.toLowerCase()))
  );

  const candidateTechInProjects = new Set<string>();
  for (const p of candidate.projects) {
    if (Array.isArray(p.technologies)) {
      p.technologies.forEach((t) => {
        if (typeof t === 'string') candidateTechInProjects.add(t.toLowerCase());
      });
    }
  }

  const disputesMap = new Map(
    (candidate.fitControls?.disputedRequirements || []).map((d) => [d.requirementId, d])
  );
  const clarificationsMap = new Map(
    (candidate.fitControls?.suppliedClarifications || []).map((c) => [c.requirementId, c])
  );

  const hasEmptyProfile =
    candidate.skills.length === 0 &&
    candidate.projects.length === 0 &&
    candidate.educations.length === 0 &&
    candidate.experiences.length === 0;

  let reqIndex = 1;

  // ── 1. Evaluate Experience Requirement ─────────────────────────────────────
  if (extracted.minYearsExperience !== null && extracted.minYearsExperience > 0) {
    const reqId = `req-exp-${reqIndex++}`;
    const dispute = disputesMap.get(reqId);
    const clarification = clarificationsMap.get(reqId);

    const requiredYears = extracted.minYearsExperience;
    const candidateProfileAny = candidate.profile as any;
    const candidateLevel = candidateProfileAny?.experienceLevel || candidateProfileAny?.experience_level || candidate.preferences?.experience_level || 'UNKNOWN';
    const totalExpMonths = candidateProfileAny?.totalExperienceMonths ?? candidateProfileAny?.total_experience_months ?? 0;

    let state: AssessmentState = 'UNKNOWN';
    let source: EvidenceSource | undefined;
    let summary: string | undefined;

    if (clarification?.value) {
      state = 'SUPPORTED';
      source = 'CLARIFICATION';
      summary = `Candidate clarified: ${clarification.value}`;
    } else if (candidateLevel === 'UNKNOWN' && totalExpMonths === 0 && candidate.experiences.length === 0) {
      state = 'UNKNOWN';
      unknownItems.push({
        requirementId: reqId,
        criterion: `Minimum ${requiredYears}+ years experience`,
        missingField: 'experienceLevel',
        actionPrompt: 'Specify your current career experience level and work history',
      });
    } else if (candidateLevel === 'FRESHER' && requiredYears >= 3) {
      // Hard eligibility concern
      state = 'HARD_ELIGIBILITY_CONCERN';
      source = 'PREFERENCE';
      summary = `Role requires ${requiredYears}+ years of experience; candidate profile indicates Fresher (0 years)`;
      if (!dispute) {
        eligibilityBlockers.push({
          requirementId: reqId,
          criterion: `Minimum ${requiredYears}+ years experience required`,
          candidateReality: 'Candidate profile indicates Fresher / 0 years experience',
          reason: `Strict ${requiredYears}+ years experience threshold cannot be satisfied by Fresher profile`,
        });
      }
    } else if (totalExpMonths >= requiredYears * 12) {
      state = 'SUPPORTED';
      source = 'EXPERIENCE';
      summary = `Candidate profile documents ${Math.round(totalExpMonths / 12 * 10) / 10} years of experience`;
    } else if (candidateLevel === 'FRESHER' && requiredYears <= 2) {
      state = 'PARTIALLY_SUPPORTED';
      source = 'PROFILE_SKILL';
      summary = `Fresher-adjacent role (${requiredYears}y); entry candidate can qualify with strong portfolio evidence`;
    } else {
      state = 'PARTIALLY_SUPPORTED';
      source = 'EXPERIENCE';
      summary = `Candidate documents ${totalExpMonths} months experience towards ${requiredYears} years requirement`;
    }

    mandatoryEvaluations.push({
      id: reqId,
      group: 'MANDATORY',
      category: 'EXPERIENCE',
      originalText: extracted.experiencePhrase || `Minimum ${requiredYears}+ years experience required`,
      extractedCriterion: `${requiredYears}+ years experience`,
      assessmentState: dispute ? 'PARTIALLY_SUPPORTED' : state,
      evidenceSource: source,
      evidenceSummary: dispute ? `Candidate dispute: ${dispute.reason}` : summary,
      isDisputed: !!dispute,
      disputeReason: dispute?.reason,
      candidateNote: dispute?.candidateNote,
      candidateClarification: clarification?.clarification,
    });
  } else if (extracted.isFresherCompatible) {
    // Fresher compatible role
    const reqId = `req-exp-fresher-${reqIndex++}`;
    const isFresher = candidate.profile?.experienceLevel === 'FRESHER' || candidate.preferences?.experience_level === 'FRESHER';
    mandatoryEvaluations.push({
      id: reqId,
      group: 'MANDATORY',
      category: 'EXPERIENCE',
      originalText: 'Fresher / Entry-Level Compatible',
      extractedCriterion: '0-2 years experience / Entry-level candidates welcome',
      assessmentState: isFresher ? 'SUPPORTED' : 'NOT_APPLICABLE',
      evidenceSource: isFresher ? 'PREFERENCE' : undefined,
      evidenceSummary: isFresher ? 'Candidate is an active Fresher job-seeker' : undefined,
    });
  }

  // ── 2. Evaluate Location & Workplace Conditions ────────────────────────────
  const jobCountry = extracted.employmentConditions.countryBoundary;
  const workplaceMode = extracted.employmentConditions.workplaceMode;

  if (jobCountry && (workplaceMode === 'ONSITE' || workplaceMode === 'HYBRID')) {
    const reqId = `req-loc-${reqIndex++}`;
    const dispute = disputesMap.get(reqId);
    const candidateLocations = candidate.preferences?.locations || [];

    let state: AssessmentState = 'NOT_APPLICABLE';
    let summary: string | undefined;
    let source: EvidenceSource | undefined;

    const matchesCandidateLocation = candidateLocations.some((loc) => {
      const l = loc.toLowerCase();
      return l.includes(jobCountry.toLowerCase()) || (extracted.employmentConditions.workLocation && l.includes(extracted.employmentConditions.workLocation.toLowerCase()));
    });

    const isDomesticIndianJob = jobCountry.toLowerCase() === 'india';
    const isForeignJob = !isDomesticIndianJob;
    const candidateIsIndian = candidateLocations.some((l) => /india|bangalore|hyderabad|pune|mumbai|delhi/i.test(l));

    if (candidateLocations.length === 0) {
      state = 'UNKNOWN';
      unknownItems.push({
        requirementId: reqId,
        criterion: `Workplace in ${jobCountry} (${workplaceMode})`,
        missingField: 'locations',
        actionPrompt: 'Set your preferred work locations in preferences',
      });
    } else if (matchesCandidateLocation) {
      state = 'SUPPORTED';
      source = 'PREFERENCE';
      summary = `Location matches your preference (${jobCountry})`;
    } else if (isForeignJob && candidateIsIndian) {
      state = 'HARD_ELIGIBILITY_CONCERN';
      source = 'PREFERENCE';
      summary = `Role is ${workplaceMode} in ${jobCountry}; candidate preferred location is India`;
      if (!dispute) {
        eligibilityBlockers.push({
          requirementId: reqId,
          criterion: `${workplaceMode} location requirement in ${jobCountry}`,
          candidateReality: `Candidate preferences specify Indian locations (${candidateLocations.join(', ')})`,
          reason: `Requires physical presence or local work authorization in ${jobCountry}`,
        });
      }
    } else {
      state = 'PARTIALLY_SUPPORTED';
      source = 'PREFERENCE';
      summary = `Role is located in ${jobCountry}`;
    }

    mandatoryEvaluations.push({
      id: reqId,
      group: 'MANDATORY',
      category: 'LOCATION',
      originalText: `Location: ${extracted.employmentConditions.workLocation || jobCountry} (${workplaceMode})`,
      extractedCriterion: `${jobCountry} (${workplaceMode})`,
      assessmentState: dispute ? 'PARTIALLY_SUPPORTED' : state,
      evidenceSource: source,
      evidenceSummary: dispute ? `Candidate dispute: ${dispute.reason}` : summary,
      isDisputed: !!dispute,
      disputeReason: dispute?.reason,
      candidateNote: dispute?.candidateNote,
    });
  }

  // ── 3. Evaluate Education Requirement ─────────────────────────────────────
  if (extracted.requiredEducation) {
    const reqId = `req-edu-${reqIndex++}`;
    const dispute = disputesMap.get(reqId);
    const clarification = clarificationsMap.get(reqId);

    let state: AssessmentState = 'UNKNOWN';
    let source: EvidenceSource | undefined;
    let summary: string | undefined;

    if (clarification?.value) {
      state = 'SUPPORTED';
      source = 'CLARIFICATION';
      summary = `Candidate clarified: ${clarification.value}`;
    } else if (candidate.educations.length === 0) {
      state = 'UNKNOWN';
      unknownItems.push({
        requirementId: reqId,
        criterion: extracted.requiredEducation.rawText,
        missingField: 'educations',
        actionPrompt: 'Add your degree or education credentials to your profile',
      });
    } else {
      const matchDegree = candidate.educations.find((edu) => {
        const d = edu.degree.toLowerCase();
        const f = (edu.fieldOfStudy || '').toLowerCase();
        const isBachelors = /bachelor|b\.?tech|b\.?s|b\.?e/i.test(d);
        const isMasters = /master|m\.?tech|m\.?s/i.test(d);

        if (extracted.requiredEducation?.degreeLevel === 'MASTER' && !isMasters) {
          return false;
        }
        return isBachelors || isMasters || /engineering|computer/i.test(f);
      });

      if (matchDegree) {
        state = 'SUPPORTED';
        source = 'EDUCATION';
        summary = `Verified degree: ${matchDegree.degree} from ${matchDegree.institution}`;
      } else {
        state = 'PARTIALLY_SUPPORTED';
        source = 'EDUCATION';
        summary = `Candidate has degrees: ${candidate.educations.map((e) => e.degree).join(', ')}`;
      }
    }

    mandatoryEvaluations.push({
      id: reqId,
      group: 'MANDATORY',
      category: 'EDUCATION',
      originalText: extracted.requiredEducation.rawText,
      extractedCriterion: `${extracted.requiredEducation.degreeLevel} degree in ${extracted.requiredEducation.fieldOfStudy || 'relevant field'}`,
      assessmentState: dispute ? 'SUPPORTED' : state,
      evidenceSource: source,
      evidenceSummary: dispute ? `Candidate note: ${dispute.candidateNote || dispute.reason}` : summary,
      isDisputed: !!dispute,
      disputeReason: dispute?.reason,
      candidateNote: dispute?.candidateNote,
      candidateClarification: clarification?.clarification,
    });
  }

  // ── 4. Evaluate Mandatory Technical Skills ────────────────────────────────
  for (const skill of extracted.mandatorySkills) {
    const reqId = `req-skill-m-${reqIndex++}`;
    const dispute = disputesMap.get(reqId);
    const clarification = clarificationsMap.get(reqId);

    const sLower = skill.toLowerCase();
    let state: AssessmentState = 'NOT_SUPPORTED';
    let source: EvidenceSource | undefined;
    let summary: string | undefined;

    if (clarification?.value) {
      state = 'SUPPORTED';
      source = 'CLARIFICATION';
      summary = `Candidate clarified: ${clarification.value}`;
    } else if (candidateSkillsSet.has(sLower)) {
      state = 'SUPPORTED';
      source = 'PROFILE_SKILL';
      summary = `Direct match in verified profile skills (${skill})`;
    } else if (candidateTechInProjects.has(sLower)) {
      state = 'SUPPORTED';
      source = 'PROJECT';
      const project = candidate.projects.find((p) => {
        if (Array.isArray(p.technologies)) {
          return p.technologies.some((t) => typeof t === 'string' && t.toLowerCase() === sLower);
        }
        return false;
      });
      summary = `Demonstrated in project: "${project?.title || 'Portfolio Project'}"`;
    } else {
      // Check work experience description
      const matchedExp = candidate.experiences.find((e) =>
        (e.description || '').toLowerCase().includes(sLower) || (e.title || '').toLowerCase().includes(sLower)
      );

      if (matchedExp) {
        state = 'SUPPORTED';
        source = 'EXPERIENCE';
        summary = `Applied in role at ${matchedExp.companyName} (${matchedExp.title})`;
      } else {
        // Check adjacent transferable technologies
        const adjacent = ADJACENT_TECH_MAP[skill] || [];
        const matchedAdjacent = adjacent.find(
          (adj) => candidateSkillsSet.has(adj.toLowerCase()) || candidateTechInProjects.has(adj.toLowerCase())
        );

        if (matchedAdjacent) {
          state = 'PARTIALLY_SUPPORTED';
          source = 'PROFILE_SKILL';
          summary = `Transferable knowledge via adjacent technology: ${matchedAdjacent}`;
        } else if (hasEmptyProfile) {
          state = 'UNKNOWN';
          unknownItems.push({
            requirementId: reqId,
            criterion: `${skill} proficiency`,
            missingField: 'skills',
            actionPrompt: `Add ${skill} or related projects to your profile`,
          });
        } else {
          state = 'NOT_SUPPORTED';
          learnableSkillGaps.push({
            requirementId: reqId,
            skillName: skill,
            importance: 'MANDATORY',
            recommendedAction: `Complete a practical project or coding lab exercising ${skill}`,
          });
        }
      }
    }

    mandatoryEvaluations.push({
      id: reqId,
      group: 'MANDATORY',
      category: 'TECHNICAL_SKILL',
      originalText: `Required proficiency: ${skill}`,
      extractedCriterion: skill,
      assessmentState: dispute ? 'PARTIALLY_SUPPORTED' : state,
      evidenceSource: source,
      evidenceSummary: dispute ? `Candidate dispute: ${dispute.reason}` : summary,
      isDisputed: !!dispute,
      disputeReason: dispute?.reason,
      candidateNote: dispute?.candidateNote,
      candidateClarification: clarification?.clarification,
    });
  }

  // ── 5. Evaluate Preferred Skills ──────────────────────────────────────────
  for (const skill of extracted.preferredSkills) {
    const reqId = `req-skill-p-${reqIndex++}`;
    const dispute = disputesMap.get(reqId);
    const clarification = clarificationsMap.get(reqId);

    const sLower = skill.toLowerCase();
    let state: AssessmentState = 'NOT_SUPPORTED';
    let source: EvidenceSource | undefined;
    let summary: string | undefined;

    if (clarification?.value) {
      state = 'SUPPORTED';
      source = 'CLARIFICATION';
      summary = `Candidate clarified: ${clarification.value}`;
    } else if (candidateSkillsSet.has(sLower)) {
      state = 'SUPPORTED';
      source = 'PROFILE_SKILL';
      summary = `Present in profile skills (${skill})`;
    } else if (candidateTechInProjects.has(sLower)) {
      state = 'SUPPORTED';
      source = 'PROJECT';
      summary = `Applied in project portfolio`;
    } else {
      const adjacent = ADJACENT_TECH_MAP[skill] || [];
      const matchedAdjacent = adjacent.find(
        (adj) => candidateSkillsSet.has(adj.toLowerCase()) || candidateTechInProjects.has(adj.toLowerCase())
      );

      if (matchedAdjacent) {
        state = 'PARTIALLY_SUPPORTED';
        source = 'PROFILE_SKILL';
        summary = `Adjacent exposure via ${matchedAdjacent}`;
      } else if (hasEmptyProfile) {
        state = 'UNKNOWN';
      } else {
        state = 'NOT_SUPPORTED';
        learnableSkillGaps.push({
          requirementId: reqId,
          skillName: skill,
          importance: 'PREFERRED',
          recommendedAction: `Optional booster: Explore ${skill} fundamentals`,
        });
      }
    }

    preferredEvaluations.push({
      id: reqId,
      group: 'PREFERRED',
      category: 'TECHNICAL_SKILL',
      originalText: `Preferred: ${skill}`,
      extractedCriterion: skill,
      assessmentState: dispute ? 'PARTIALLY_SUPPORTED' : state,
      evidenceSource: source,
      evidenceSummary: dispute ? `Candidate dispute: ${dispute.reason}` : summary,
      isDisputed: !!dispute,
      disputeReason: dispute?.reason,
      candidateNote: dispute?.candidateNote,
      candidateClarification: clarification?.clarification,
    });
  }

  // ── 6. Determine Overall Status (Blueprint Section 5.4) ────────────────────
  let overallStatus: 'ELIGIBLE' | 'ELIGIBILITY_CONCERN_DETECTED' | 'NEEDS_PROFILE_COMPLETION' = 'ELIGIBLE';

  if (eligibilityBlockers.length > 0) {
    overallStatus = 'ELIGIBILITY_CONCERN_DETECTED';
  } else if (hasEmptyProfile || unknownItems.length >= 3) {
    overallStatus = 'NEEDS_PROFILE_COMPLETION';
  } else {
    overallStatus = 'ELIGIBLE';
  }

  return {
    jobId,
    userId,
    overallEligibilityStatus: overallStatus,
    mandatoryEvaluations,
    preferredEvaluations,
    responsibilities: extracted.responsibilities,
    employmentConditions: extracted.employmentConditions,
    eligibilityBlockers,
    learnableSkillGaps,
    unknownItems,
    candidateControlsApplied: {
      disputesCount: disputesMap.size,
      clarificationsCount: clarificationsMap.size,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ─── Database Operations (Persistence & User Isolation) ──────────────────────

/**
 * Loads candidate profile context and target job from the database, then evaluates fit.
 */
export async function getProofBasedJobFit(userId: string, jobId: string): Promise<ProofBasedJobFitAnalysis> {
  const db = getDb();

  // 1. Fetch Target Job
  const [jobRecord] = await db
    .select({
      id: schema.jobs.id,
      title: schema.jobs.title,
      description: schema.jobs.description,
      requirements: schema.jobs.requirements,
      location: schema.jobs.location,
      workplace_type: schema.jobs.workplace_type,
      employment_type: schema.jobs.employment_type,
    })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId))
    .limit(1);

  if (!jobRecord) {
    throw new Error(`Job not found: ${jobId}`);
  }

  // 2. Fetch Candidate Profile & Evidence (Scoped strictly to userId)
  const [profile] = await db
    .select()
    .from(schema.candidateProfiles)
    .where(eq(schema.candidateProfiles.user_id, userId))
    .limit(1);

  const skills = await db
    .select({
      skillName: schema.candidateSkills.skill_name,
      canonicalName: schema.candidateSkills.canonical_name,
    })
    .from(schema.candidateSkills)
    .where(eq(schema.candidateSkills.user_id, userId));

  const educations = await db
    .select({
      degree: schema.candidateEducations.degree,
      fieldOfStudy: schema.candidateEducations.field_of_study,
      institution: schema.candidateEducations.institution,
    })
    .from(schema.candidateEducations)
    .where(eq(schema.candidateEducations.user_id, userId));

  const projects = await db
    .select({
      title: schema.candidateProjects.title,
      description: schema.candidateProjects.description,
      technologies: schema.candidateProjects.technologies,
    })
    .from(schema.candidateProjects)
    .where(eq(schema.candidateProjects.user_id, userId));

  const experiences = await db
    .select({
      title: schema.candidateExperiences.title,
      companyName: schema.candidateExperiences.company_name,
      description: schema.candidateExperiences.description,
      isInternship: schema.candidateExperiences.is_internship,
      startDate: schema.candidateExperiences.start_date,
      endDate: schema.candidateExperiences.end_date,
    })
    .from(schema.candidateExperiences)
    .where(eq(schema.candidateExperiences.user_id, userId));

  const [preferences] = await db
    .select({
      locations: schema.userPreferences.locations,
      workplace_types: schema.userPreferences.workplace_types,
      roles: schema.userPreferences.roles,
      experience_level: schema.userPreferences.experience_level,
    })
    .from(schema.userPreferences)
    .where(eq(schema.userPreferences.user_id, userId))
    .limit(1);

  // 3. Fetch User-Job Interaction Controls
  const [interaction] = await db
    .select({
      fit_controls: schema.userJobInteractions.fit_controls,
    })
    .from(schema.userJobInteractions)
    .where(and(eq(schema.userJobInteractions.user_id, userId), eq(schema.userJobInteractions.job_id, jobId)))
    .limit(1);

  const fitControls = (interaction?.fit_controls as CandidateFitControls) || null;

  return evaluateProofBasedJobFit({
    jobId,
    userId,
    job: {
      title: jobRecord.title,
      description: jobRecord.description,
      requirements: jobRecord.requirements,
      roleCategory: null,
      experienceLevel: null,
      location: jobRecord.location,
      country: deriveCountryFromLocation(jobRecord.location),
      workplaceType: jobRecord.workplace_type,
      employmentType: jobRecord.employment_type,
      rawMetadata: null,
    },
    candidate: {
      profile: profile ? (profile as any) : null,
      skills,
      educations,
      projects,
      experiences,
      preferences: preferences
        ? {
            locations: (preferences.locations as string[]) || [],
            workplace_types: (preferences.workplace_types as string[]) || [],
            roles: (preferences.roles as string[]) || [],
            experience_level: preferences.experience_level || 'FRESHER',
          }
        : null,
      fitControls,
    },
  });
}

/**
 * Persists candidate fit controls (disputes / clarifications) and returns updated analysis.
 */
export async function updateProofFitControls(
  userId: string,
  jobId: string,
  controls: {
    disputedRequirements?: Array<{ requirementId: string; reason: string; candidateNote?: string }>;
    suppliedClarifications?: Array<{ requirementId: string; clarification: string; value?: string }>;
  }
): Promise<ProofBasedJobFitAnalysis> {
  const db = getDb();
  const now = new Date().toISOString();

  // Sanitize and structure controls
  const sanitizedControls: CandidateFitControls = {
    disputedRequirements: (controls.disputedRequirements || []).map((d) => ({
      requirementId: String(d.requirementId),
      reason: String(d.reason || ''),
      candidateNote: d.candidateNote ? String(d.candidateNote) : undefined,
      disputedAt: now,
    })),
    suppliedClarifications: (controls.suppliedClarifications || []).map((c) => ({
      requirementId: String(c.requirementId),
      clarification: String(c.clarification || ''),
      value: c.value ? String(c.value) : undefined,
      suppliedAt: now,
    })),
  };

  // Check if interaction record exists
  const [existing] = await db
    .select({ id: schema.userJobInteractions.id })
    .from(schema.userJobInteractions)
    .where(and(eq(schema.userJobInteractions.user_id, userId), eq(schema.userJobInteractions.job_id, jobId)))
    .limit(1);

  if (existing) {
    await db
      .update(schema.userJobInteractions)
      .set({
        fit_controls: sanitizedControls,
        updated_at: new Date(),
      })
      .where(and(eq(schema.userJobInteractions.user_id, userId), eq(schema.userJobInteractions.job_id, jobId)));
  } else {
    await db.insert(schema.userJobInteractions).values({
      user_id: userId,
      job_id: jobId,
      fit_controls: sanitizedControls,
    });
  }

  log.info({ userId, jobId, disputes: sanitizedControls.disputedRequirements?.length }, 'Candidate fit controls updated');

  // Immediately re-evaluate deterministically
  return getProofBasedJobFit(userId, jobId);
}
