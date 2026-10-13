/**
 * Career Preference Taxonomy.
 *
 * Provides configurable standard roles, location normalization rules, and
 * experience levels for user onboarding and preference matching.
 */

// ─── Standard Roles ──────────────────────────────────────────────────────────

export const STANDARD_ROLES: readonly string[] = [
  'Software Engineer',
  'Software Developer',
  'Frontend Developer',
  'Backend Developer',
  'Full Stack Developer',
  'Java Developer',
  'Python Developer',
  'DevOps Engineer',
  'Cloud Engineer',
  'Data Analyst',
  'Data Scientist',
  'Machine Learning Engineer',
  'QA Engineer',
  'Business Analyst',
  'Product Manager',
  'Security Engineer',
  'Systems Engineer',
] as const;

// ─── Location Normalization ──────────────────────────────────────────────────

/**
 * Standard canonical locations and their known variations/aliases.
 */
export const LOCATION_ALIASES: Record<string, string> = {
  // Bengaluru / Bangalore
  bangalore: 'Bangalore',
  bengaluru: 'Bangalore',
  blr: 'Bangalore',

  // Hyderabad
  hyderabad: 'Hyderabad',
  hyd: 'Hyderabad',

  // Pune
  pune: 'Pune',

  // Chennai / Madras
  chennai: 'Chennai',
  madras: 'Chennai',

  // Mumbai / Bombay
  mumbai: 'Mumbai',
  bombay: 'Mumbai',

  // Delhi NCR / Noida / Gurgaon
  'delhi ncr': 'Delhi NCR',
  delhi: 'Delhi NCR',
  'new delhi': 'Delhi NCR',
  ncr: 'Delhi NCR',
  noida: 'Noida',
  gurgaon: 'Gurgaon',
  gurugram: 'Gurgaon',

  // Remote
  remote: 'Remote',
  'work from home': 'Remote',
  wfh: 'Remote',
  anywhere: 'Remote',
};

export const STANDARD_LOCATIONS: readonly string[] = [
  'Bangalore',
  'Hyderabad',
  'Pune',
  'Chennai',
  'Mumbai',
  'Delhi NCR',
  'Noida',
  'Gurgaon',
  'Remote',
] as const;

/**
 * Normalize a location string to its canonical form if known,
 * or clean up whitespace/casing for custom locations.
 */
export function normalizeLocation(location: string): string {
  const trimmed = location.trim();
  const lower = trimmed.toLowerCase();

  if (LOCATION_ALIASES[lower]) {
    return LOCATION_ALIASES[lower]!;
  }

  // Capitalize words for custom locations
  return trimmed
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// ─── Experience Levels ───────────────────────────────────────────────────────

export type ExperienceLevel = 'FRESHER' | 'EXPERIENCED' | 'ANY';

export const VALID_EXPERIENCE_LEVELS: readonly ExperienceLevel[] = [
  'FRESHER',
  'EXPERIENCED',
  'ANY',
] as const;

export function isValidExperienceLevel(val: string): val is ExperienceLevel {
  return VALID_EXPERIENCE_LEVELS.includes(val as ExperienceLevel);
}
