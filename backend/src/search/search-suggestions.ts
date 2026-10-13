/**
 * Universal Search Suggestions & Autocomplete Engine.
 *
 * Provides real-time, category-agnostic suggestions across:
 * - Roles across all 25+ disciplines (Software, Data, Product, Design, Finance, HR, Marketing, etc.)
 * - Popular natural-language search patterns (e.g. "Fresher Java Developer in Bangalore")
 * - Skills with canonical synonyms
 * - Locations (India-first & International)
 * - Experience & Workplace modifiers
 */

import type { SearchSuggestion } from './search-types.js';
import { SKILL_SYNONYMS, SEARCH_LOCATIONS, ROLE_PATTERNS } from './search-parser.js';

// --- POPULAR NATURAL SEARCH COMBINATIONS ---
const CURATED_SEARCH_PATTERNS = [
  // Fresher & Entry-Level
  { text: 'Fresher Software Engineer in Bangalore', category: 'Software Engineering', badge: 'Fresher' },
  { text: 'Fresher Java Developer jobs', category: 'Software Engineering', badge: 'Fresher' },
  { text: 'Entry level Frontend Developer remote India', category: 'Software Engineering', badge: 'Fresher' },
  { text: 'Fresher Data Analyst in Pune', category: 'Data & Analytics', badge: 'Fresher' },
  { text: 'Fresher HR / Talent Acquisition Intern', category: 'Human Resources', badge: 'Fresher' },
  { text: 'Fresher Financial Analyst in Mumbai', category: 'Finance', badge: 'Fresher' },
  { text: 'Fresher UX / Product Designer', category: 'Design', badge: 'Fresher' },
  { text: 'Fresher Marketing & Content Associate', category: 'Marketing', badge: 'Fresher' },
  { text: 'Fresher Customer Success Associate', category: 'Customer Success', badge: 'Fresher' },
  { text: 'Graduate Engineer Trainee (GET)', category: 'Engineering', badge: 'Fresher' },

  // Experienced
  { text: 'Senior Backend Engineer in Bengaluru', category: 'Software Engineering', badge: 'Experienced' },
  { text: 'Senior Data Scientist', category: 'Data & AI', badge: 'Experienced' },
  { text: 'Staff DevOps / SRE Engineer', category: 'Infrastructure', badge: 'Experienced' },
  { text: 'Product Manager in London', category: 'Product Management', badge: 'Experienced' },
  { text: 'QA Automation Engineer in Chennai', category: 'Quality Assurance', badge: 'Technical' },
  { text: 'Remote Customer Success jobs in India', category: 'Customer Success', badge: 'Remote' },
  { text: 'Cybersecurity / InfoSec Engineer', category: 'Security', badge: 'Technical' },
];

export function getSearchSuggestions(query: string, maxResults: number = 8): SearchSuggestion[] {
  const trimmed = (query || '').trim().toLowerCase();
  const results: SearchSuggestion[] = [];
  const seenTexts = new Set<string>();

  const addSuggestion = (s: SearchSuggestion) => {
    if (!seenTexts.has(s.text.toLowerCase()) && results.length < maxResults) {
      seenTexts.add(s.text.toLowerCase());
      results.push(s);
    }
  };

  // If query is empty, provide popular diverse starter suggestions
  if (!trimmed) {
    for (const p of CURATED_SEARCH_PATTERNS.slice(0, maxResults)) {
      addSuggestion({
        text: p.text,
        type: 'ROLE',
        categoryLabel: p.category,
        badge: p.badge,
      });
    }
    return results;
  }

  // 1. Match curated search patterns
  for (const p of CURATED_SEARCH_PATTERNS) {
    if (p.text.toLowerCase().includes(trimmed)) {
      addSuggestion({
        text: p.text,
        type: 'ROLE',
        categoryLabel: p.category,
        badge: p.badge,
      });
    }
  }

  // 2. Match canonical roles from all categories (checking role name, patterns, and category keywords)
  for (const roleDef of ROLE_PATTERNS) {
    const roleName = roleDef.canonicalRole;
    const catName = roleDef.category.toLowerCase().replace(/_/g, ' ');
    const matchesRole = roleName.toLowerCase().includes(trimmed);
    const matchesCat = catName.includes(trimmed);
    const matchesPattern = roleDef.patterns.some((p) => p.test(trimmed) || p.source.toLowerCase().includes(trimmed));

    if (matchesRole || matchesCat || matchesPattern) {
      addSuggestion({
        text: roleName,
        type: 'ROLE',
        categoryLabel: roleDef.category.replace(/_/g, ' '),
      });
    }
  }

  // 3. Match Skills
  for (const [key, canonical] of Object.entries(SKILL_SYNONYMS)) {
    if (key.startsWith(trimmed) || canonical.toLowerCase().startsWith(trimmed)) {
      addSuggestion({
        text: canonical,
        type: 'SKILL',
        categoryLabel: 'Skill',
      });
    }
  }

  // 4. Match Locations
  for (const [key, locData] of Object.entries(SEARCH_LOCATIONS)) {
    if (key.startsWith(trimmed) || locData.city.toLowerCase().startsWith(trimmed)) {
      addSuggestion({
        text: `Jobs in ${locData.city} (${locData.country})`,
        type: 'LOCATION',
        categoryLabel: 'Location',
      });
    }
  }

  // 5. Dynamic prefixes (e.g. user typed "java", suggest "Fresher Java Developer", "Senior Java Engineer")
  if (trimmed.length >= 2) {
    const skillMatch = Object.entries(SKILL_SYNONYMS).find(
      ([k, c]) => k === trimmed || c.toLowerCase() === trimmed
    );
    if (skillMatch) {
      const skillName = skillMatch[1];
      addSuggestion({
        text: `Fresher ${skillName} Developer`,
        type: 'ROLE',
        categoryLabel: 'Software Engineering',
        badge: 'Fresher',
      });
      addSuggestion({
        text: `Senior ${skillName} Engineer`,
        type: 'ROLE',
        categoryLabel: 'Software Engineering',
        badge: 'Experienced',
      });
    }
  }

  return results;
}
