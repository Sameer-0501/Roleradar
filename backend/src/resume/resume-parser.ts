/**
 * Deterministic Resume Parser.
 *
 * Extracts structured career signals (skills, education, projects, certifications,
 * experience, and target roles) from resume text without LLM hallucination.
 *
 * Reuses RoleRadar canonical taxonomy and Phase 12 synonym mappings.
 */

import { SKILL_SYNONYMS, ROLE_PATTERNS } from '../search/search-parser.js';
import type {
  ParsedResumeData,
  CandidateSkillDto,
  CandidateEducationDto,
  CandidateProjectDto,
  CandidateCertificationDto,
  CandidateExperienceDto,
} from './resume-types.js';

// --- Universal Degree Patterns ---
const DEGREE_PATTERNS = [
  { degree: 'B.Tech / B.E.', regex: /\b(b\.?\s*tech(?:nology)?|b\.?\s*e\.?|bachelor\s+of\s+technology|bachelor\s+of\s+engineering)\b/i },
  { degree: 'M.Tech / M.E.', regex: /\b(m\.?\s*tech(?:nology)?|m\.?\s*e\.?|master\s+of\s+technology|master\s+of\s+engineering)\b/i },
  { degree: 'B.S. / B.Sc', regex: /\b(b\.?\s*s\.?|b\.?\s*sc\.?|bachelor\s+of\s+science)\b/i },
  { degree: 'M.S. / M.Sc', regex: /\b(m\.?\s*s\.?|m\.?\s*sc\.?|master\s+of\s+science)\b/i },
  { degree: 'BCA', regex: /\b(b\.?\s*c\.?\s*a\.?|bachelor\s+of\s+computer\s+applications?)\b/i },
  { degree: 'MCA', regex: /\b(m\.?\s*c\.?\s*a\.?|master\s+of\s+computer\s+applications?)\b/i },
  { degree: 'MBA', regex: /\b(m\.?\s*b\.?\s*a\.?|master\s+of\s+business\s+administration)\b/i },
  { degree: 'BBA', regex: /\b(b\.?\s*b\.?\s*a\.?|bachelor\s+of\s+business\s+administration)\b/i },
  { degree: 'B.Com', regex: /\b(b\.?\s*com(?:merce)?|bachelor\s+of\s+commerce)\b/i },
  { degree: 'Ph.D', regex: /\b(ph\.?\s*d\.?|doctor\s+of\s+philosophy|doctorate)\b/i },
  { degree: 'High School / Diploma', regex: /\b(diploma|higher\s+secondary|12th|class\s+xii|senior\s+secondary)\b/i },
];

const FIELD_PATTERNS = [
  { field: 'Computer Science & Engineering', regex: /\b(computer\s+science(?:\s+and\s+engineering)?|cse|cs|information\s+technology|it)\b/i },
  { field: 'Data Science & AI', regex: /\b(data\s+science|artificial\s+intelligence|machine\s+learning|ai\s*[\/&]\s*ml)\b/i },
  { field: 'Electrical / Electronics', regex: /\b(electronics(?:\s+and\s+communication)?|ece|electrical(?:\s+and\s+electronics)?|eee)\b/i },
  { field: 'Mechanical Engineering', regex: /\b(mechanical\s+engineering|mechanical)\b/i },
  { field: 'Civil Engineering', regex: /\b(civil\s+engineering|civil)\b/i },
  { field: 'Finance & Accounting', regex: /\b(finance|accounting|commerce|banking)\b/i },
  { field: 'Business Administration / Management', regex: /\b(business\s+administration|management|marketing|human\s+resources|hr)\b/i },
  { field: 'Design / Human-Computer Interaction', regex: /\b(design|ui\s*[\/&]\s*ux|interaction\s+design|hci)\b/i },
];

// --- Known Certification Issuers ---
const CERT_ISSUERS = [
  { issuer: 'Amazon Web Services (AWS)', regex: /\b(aws|amazon\s+web\s+services)\b/i },
  { issuer: 'Google Cloud (GCP)', regex: /\b(google\s+cloud|gcp)\b/i },
  { issuer: 'Microsoft Azure', regex: /\b(azure|microsoft\s+certified)\b/i },
  { issuer: 'Meta', regex: /\b(meta\s+front\s*end|meta\s+back\s*end|meta\s+certified)\b/i },
  { issuer: 'Cisco', regex: /\b(ccna|ccnp|cisco)\b/i },
  { issuer: 'Kubernetes (CNCF)', regex: /\b(cka|ckad|cks|cncf|kubernetes\s+certified)\b/i },
  { issuer: 'Oracle', regex: /\b(oracle\s+certified|java\s+certified)\b/i },
  { issuer: 'HashiCorp', regex: /\b(terraform\s+associate|hashicorp)\b/i },
  { issuer: 'Coursera / Stanford', regex: /\b(deeplearning\.ai|coursera|stanford\s+online)\b/i },
];

/**
 * Parse plain resume text into a structured Candidate Profile.
 */
export function parseResumeText(rawText: string): ParsedResumeData {
  const text = (rawText || '').trim();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  // 1. Extract Basic Identity (Name, Email, Phone)
  let fullName = '';
  let email = '';
  let phone = '';

  const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  if (emailMatch) email = emailMatch[0];

  const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?(\d{5}[-.\s]?\d{5}|\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\d{10})\b/);
  if (phoneMatch) phone = phoneMatch[1] ? phoneMatch[1].trim() : phoneMatch[0].trim();

  // Name is typically the first non-empty line before email/phone
  if (lines.length > 0) {
    const firstLine = lines[0]!;
    if (!firstLine.includes('@') && !firstLine.match(/\d{5,}/) && firstLine.length < 50) {
      fullName = firstLine.replace(/[^a-zA-Z\s.-]/g, '').trim();
    }
  }

  // 2. Extract Skills (Exact matching with Canonical Normalization)
  const skills: CandidateSkillDto[] = [];
  const matchedSkillKeys = new Set<string>();

  for (const [key, canonical] of Object.entries(SKILL_SYNONYMS)) {
    if (key === 'go') {
      if (/\b(golang|go\s+developer|go\s+engineer|go\s+backend)\b/i.test(text)) {
        if (!matchedSkillKeys.has('Go')) {
          matchedSkillKeys.add('Go');
          skills.push({ skillName: 'Go', canonicalName: 'Go', category: 'Programming Languages', source: 'PARSED' });
        }
      }
      continue;
    }

    const skillRegex = new RegExp(`\\b${key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    if (skillRegex.test(text)) {
      if (!matchedSkillKeys.has(canonical)) {
        matchedSkillKeys.add(canonical);
        skills.push({
          skillName: canonical,
          canonicalName: canonical,
          category: getSkillCategory(canonical),
          source: 'PARSED',
        });
      }
    }
  }

  // 3. Extract Education History (Scanning degree and adjacent lines for institution & years)
  const educations: CandidateEducationDto[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const deg of DEGREE_PATTERNS) {
      if (deg.regex.test(line)) {
        let fieldOfStudy: string | null = null;
        for (const f of FIELD_PATTERNS) {
          if (f.regex.test(line) || (lines[i + 1] && f.regex.test(lines[i + 1]!))) {
            fieldOfStudy = f.field;
            break;
          }
        }

        // Search current line and next 2 lines for years and institution
        const contextText = [line, lines[i + 1] || '', lines[i + 2] || ''].join(' ');
        const years = contextText.match(/\b(19\d{2}|20\d{2})\b/g);
        const startYear = years && years.length > 1 ? parseInt(years[0]!, 10) : null;
        const endYear = years ? parseInt(years[years.length - 1]!, 10) : null;

        let institution = 'University / College';
        const instMatch = contextText.match(/(?:at|from|,|\n)?\s*([A-Za-z\s]+(?:University|Institute|College|Academy|IIT|NIT|BITS|IIIT)[A-Za-z\s]*)/i);
        if (instMatch && instMatch[1]) {
          institution = instMatch[1].replace(/^(?:at|from|,)\s+/i, '').trim();
        }

        educations.push({
          institution,
          degree: deg.degree,
          fieldOfStudy,
          startYear,
          endYear,
        });
        break;
      }
    }
  }

  // 4. Extract Projects
  const projects: CandidateProjectDto[] = [];
  const projectHeaderIdx = lines.findIndex((l) => /^(projects|academic projects|key projects|personal projects)\b/i.test(l));
  if (projectHeaderIdx !== -1) {
    for (let i = projectHeaderIdx + 1; i < Math.min(lines.length, projectHeaderIdx + 15); i++) {
      const line = lines[i]!;
      if (/^(experience|education|skills|certifications|awards)\b/i.test(line)) {
        break;
      }
      if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*') || line.includes(':')) {
        const parts = line.replace(/^[•\-*]\s*/, '').split(/[:–-]/);
        if (parts.length > 1 && parts[0]!.length < 40) {
          const title = parts[0]!.trim();
          const desc = parts.slice(1).join(' ').trim();
          const techInProject = skills
            .map((s) => s.canonicalName)
            .filter((s) => desc.toLowerCase().includes(s.toLowerCase()));

          projects.push({
            title,
            description: desc,
            technologies: techInProject.length > 0 ? techInProject : undefined,
          });
        }
      }
    }
  }

  // 5. Extract Certifications
  const certifications: CandidateCertificationDto[] = [];
  const certHeaderIdx = lines.findIndex((l) => /^(certifications|licenses & certifications|courses)\b/i.test(l));
  const certScanLines = certHeaderIdx !== -1
    ? lines.slice(certHeaderIdx + 1, certHeaderIdx + 15)
    : lines;

  for (const line of certScanLines) {
    if (/^(experience|education|skills|projects|awards)\b/i.test(line)) {
      break;
    }
    for (const cert of CERT_ISSUERS) {
      if (cert.regex.test(line)) {
        const yearMatch = line.match(/\b(20\d{2})\b/);
        const issueYear = yearMatch ? parseInt(yearMatch[1]!, 10) : null;
        const certName = line.replace(/^[•\-*]\s*/, '').trim();

        if (certName.length < 80 && !certifications.some((c) => c.name === certName)) {
          certifications.push({
            name: certName,
            issuer: cert.issuer,
            issueYear,
          });
        }
      }
    }
  }

  // 6. Extract Experience / Internships & Calculate Duration
  const experiences: CandidateExperienceDto[] = [];
  let totalMonths = 0;

  const expHeaderIdx = lines.findIndex((l) => /^(experience|work experience|employment history|internships)\b/i.test(l));
  if (expHeaderIdx !== -1) {
    for (let i = expHeaderIdx + 1; i < Math.min(lines.length, expHeaderIdx + 20); i++) {
      const line = lines[i]!;
      if (/^(education|skills|certifications|projects|awards)\b/i.test(line)) {
        break;
      }

      const isIntern = /\b(intern|internship|trainee|apprentice)\b/i.test(line);

      // Extract Company and Title
      if (line.includes(' at ') || line.includes(' - ') || line.includes(' | ')) {
        const parts = line.replace(/^[•\-*]\s*/, '').split(/\s+(?:at|-|\|)\s+/);
        if (parts.length >= 2 && parts[0]!.length < 50 && parts[1]!.length < 50) {
          const title = parts[0]!.trim();
          const company = parts[1]!.trim();

          // Duration estimation
          const durationMonths = isIntern ? 3 : 12;
          totalMonths += durationMonths;

          experiences.push({
            title,
            companyName: company,
            isInternship: isIntern,
            isCurrent: false,
            description: lines[i + 1] && !lines[i + 1]!.includes(' at ') ? lines[i + 1] : undefined,
          });
        }
      }
    }
  }

  // 7. Determine Experience Tier
  const experienceLevel: 'FRESHER' | 'EXPERIENCED' = (totalMonths < 12) ? 'FRESHER' : 'EXPERIENCED';

  // 8. Determine Target Roles based on parsed skills & taxonomy
  const targetRoles: string[] = [];
  for (const roleDef of ROLE_PATTERNS) {
    for (const pattern of roleDef.patterns) {
      if (pattern.test(text)) {
        if (!targetRoles.includes(roleDef.canonicalRole)) {
          targetRoles.push(roleDef.canonicalRole);
        }
        break;
      }
    }
  }

  const primaryRole = targetRoles[0] || (skills.length > 0 ? 'Software Engineer' : 'General Applicant');

  return {
    fullName: fullName || undefined,
    email: email || undefined,
    phone: phone || undefined,
    headline: `${experienceLevel === 'FRESHER' ? 'Fresher' : 'Experienced'} ${primaryRole}`,
    summary: `${primaryRole} candidate with proficiency in ${skills.slice(0, 4).map((s) => s.canonicalName).join(', ')}.`,
    primaryRole,
    targetRoles: targetRoles.length > 0 ? targetRoles : [primaryRole],
    experienceLevel,
    totalExperienceMonths: totalMonths,
    skills,
    educations,
    projects,
    certifications,
    experiences,
  };
}

function getSkillCategory(canonicalSkill: string): string {
  const s = canonicalSkill.toLowerCase();
  if (['javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'golang', 'go', 'rust', 'php', 'ruby', 'kotlin', 'swift', 'scala'].includes(s)) {
    return 'Programming Languages';
  }
  if (['react', 'node.js', 'vue', 'angular', 'next.js', 'express', 'django', 'spring', 'flask', 'fastapi'].includes(s)) {
    return 'Frameworks & Libraries';
  }
  if (['postgresql', 'mongodb', 'mysql', 'redis', 'elasticsearch', 'dynamodb', 'sql'].includes(s)) {
    return 'Databases';
  }
  if (['amazon web services', 'google cloud', 'azure', 'docker', 'kubernetes', 'terraform', 'ci/cd', 'linux'].includes(s)) {
    return 'Cloud & DevOps';
  }
  if (['figma', 'ui design', 'ux design', 'adobe xd', 'wireframing'].includes(s)) {
    return 'Design';
  }
  if (['financial analysis', 'excel', 'accounting', 'budgeting', 'financial modeling'].includes(s)) {
    return 'Finance';
  }
  return 'Technical';
}
