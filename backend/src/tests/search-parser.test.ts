import { describe, it, expect } from 'vitest';
import { parseSearchQuery } from '../search/search-parser.js';
import { getSearchSuggestions } from '../search/search-suggestions.js';

describe('Phase 12: Search Intelligence — Query Parser', () => {
  it('1. Parses "fresher java developer jobs in Bangalore"', () => {
    const intent = parseSearchQuery('fresher java developer jobs in Bangalore');
    expect(intent.experienceLevel).toBe('FRESHER');
    expect(intent.roles).toContain('Software Engineer');
    expect(intent.skills).toContain('Java');
    expect(intent.locations).toContain('Bangalore');
    expect(intent.country).toBe('India');
    expect(intent.isNaturalLanguage).toBe(true);
  });

  it('2. Parses "entry level frontend jobs remote India"', () => {
    const intent = parseSearchQuery('entry level frontend jobs remote India');
    expect(intent.experienceLevel).toBe('FRESHER');
    expect(intent.roles).toContain('Software Engineer');
    expect(intent.workplaceTypes).toContain('REMOTE');
    expect(intent.country).toBe('India');
  });

  it('3. Parses "finance analyst jobs in Mumbai"', () => {
    const intent = parseSearchQuery('finance analyst jobs in Mumbai');
    expect(intent.roles).toContain('Financial Analyst');
    expect(intent.occupationalCategory).toBe('FINANCE_ACCOUNTING');
    expect(intent.locations).toContain('Mumbai');
    expect(intent.country).toBe('India');
  });

  it('4. Parses "HR recruiter fresher jobs Hyderabad"', () => {
    const intent = parseSearchQuery('HR recruiter fresher jobs Hyderabad');
    expect(intent.experienceLevel).toBe('FRESHER');
    expect(intent.roles).toContain('Recruiter');
    expect(intent.occupationalCategory).toBe('HR_RECRUITING');
    expect(intent.locations).toContain('Hyderabad');
  });

  it('5. Parses "senior backend engineer in Bengaluru"', () => {
    const intent = parseSearchQuery('senior backend engineer in Bengaluru');
    expect(intent.experienceLevel).toBe('EXPERIENCED');
    expect(intent.roles).toContain('Software Engineer');
    expect(intent.locations).toContain('Bangalore');
    expect(intent.country).toBe('India');
  });

  it('6. Parses "marketing jobs in India hybrid"', () => {
    const intent = parseSearchQuery('marketing jobs in India hybrid');
    expect(intent.roles).toContain('Marketing Specialist');
    expect(intent.occupationalCategory).toBe('MARKETING');
    expect(intent.workplaceTypes).toContain('HYBRID');
    expect(intent.country).toBe('India');
  });

  it('7. Parses "data analyst jobs in Pune"', () => {
    const intent = parseSearchQuery('data analyst jobs in Pune');
    expect(intent.roles).toContain('Data Analyst');
    expect(intent.occupationalCategory).toBe('DATA_AI_ML');
    expect(intent.locations).toContain('Pune');
  });

  it('8. Parses "remote customer success jobs in India"', () => {
    const intent = parseSearchQuery('remote customer success jobs in India');
    expect(intent.roles).toContain('Customer Success Manager');
    expect(intent.occupationalCategory).toBe('CUSTOMER_SUCCESS');
    expect(intent.workplaceTypes).toContain('REMOTE');
    expect(intent.country).toBe('India');
  });

  it('9. Parses "product manager jobs in London"', () => {
    const intent = parseSearchQuery('product manager jobs in London');
    expect(intent.roles).toContain('Product Manager');
    expect(intent.occupationalCategory).toBe('PRODUCT');
    expect(intent.locations).toContain('London');
    expect(intent.country).toBe('United Kingdom');
  });

  it('10. Parses "QA automation jobs Chennai"', () => {
    const intent = parseSearchQuery('QA automation jobs Chennai');
    expect(intent.roles).toContain('QA Engineer');
    expect(intent.occupationalCategory).toBe('QA_TESTING');
    expect(intent.locations).toContain('Chennai');
    expect(intent.country).toBe('India');
  });

  it('11. Canonicalizes skill synonyms (JS, TS, Postgres, AWS, GCP, React.js)', () => {
    const q1 = parseSearchQuery('react.js and node.js developer with postgres');
    expect(q1.skills).toContain('React');
    expect(q1.skills).toContain('Node.js');
    expect(q1.skills).toContain('PostgreSQL');

    const q2 = parseSearchQuery('js and ts developer on aws and gcp');
    expect(q2.skills).toContain('JavaScript');
    expect(q2.skills).toContain('TypeScript');
    expect(q2.skills).toContain('Amazon Web Services');
    expect(q2.skills).toContain('Google Cloud');
  });

  it('12. Distinguishes workplace modes (onsite, hybrid, remote, onsite or hybrid)', () => {
    const q1 = parseSearchQuery('onsite java developer in Gurgaon');
    expect(q1.workplaceTypes).toEqual(['ONSITE']);
    expect(q1.locations).toContain('Delhi NCR');

    const q2 = parseSearchQuery('onsite or hybrid developer in Noida');
    expect(q2.workplaceTypes).toEqual(['ONSITE', 'HYBRID']);
    expect(q2.locations).toContain('Delhi NCR');
  });

  it('13. Supports Design & UX category parsing', () => {
    const q = parseSearchQuery('fresher UX designer in Bangalore');
    expect(q.experienceLevel).toBe('FRESHER');
    expect(q.roles).toContain('Product Designer');
    expect(q.occupationalCategory).toBe('DESIGN_UX');
    expect(q.locations).toContain('Bangalore');
  });

  // ── GET / Graduate Engineer Trainee Parser Rules ──────────────────────────

  it('14. Maps discipline-specific GET queries to the correct engineering roles and Fresher experience', () => {
    // Mechanical
    const qMech1 = parseSearchQuery('graduate engineer trainee mechanical');
    expect(qMech1.roles).toContain('Mechanical Engineer');
    expect(qMech1.occupationalCategory).toBe('ENGINEERING_OTHER');
    expect(qMech1.experienceLevel).toBe('FRESHER');

    const qMech2 = parseSearchQuery('get mechanical');
    expect(qMech2.roles).toContain('Mechanical Engineer');
    expect(qMech2.occupationalCategory).toBe('ENGINEERING_OTHER');
    expect(qMech2.experienceLevel).toBe('FRESHER');

    // Electrical
    const qElec1 = parseSearchQuery('graduate engineer trainee electrical');
    expect(qElec1.roles).toContain('Electrical Engineer');
    expect(qElec1.occupationalCategory).toBe('ENGINEERING_OTHER');

    const qElec2 = parseSearchQuery('get electrical');
    expect(qElec2.roles).toContain('Electrical Engineer');
    expect(qElec2.occupationalCategory).toBe('ENGINEERING_OTHER');

    // Civil
    const qCivil1 = parseSearchQuery('graduate engineer trainee civil');
    expect(qCivil1.roles).toContain('Civil Engineer');
    expect(qCivil1.occupationalCategory).toBe('ENGINEERING_OTHER');

    const qCivil2 = parseSearchQuery('get civil');
    expect(qCivil2.roles).toContain('Civil Engineer');
    expect(qCivil2.occupationalCategory).toBe('ENGINEERING_OTHER');

    // Hardware & Electronics
    const qHard1 = parseSearchQuery('graduate engineer trainee hardware');
    expect(qHard1.roles).toContain('Hardware & Electronics Engineer');
    expect(qHard1.occupationalCategory).toBe('HARDWARE_EMBEDDED');

    const qHard2 = parseSearchQuery('get hardware');
    expect(qHard2.roles).toContain('Hardware & Electronics Engineer');
    expect(qHard2.occupationalCategory).toBe('HARDWARE_EMBEDDED');
    
    const qHard3 = parseSearchQuery('graduate engineer trainee electronics');
    expect(qHard3.roles).toContain('Hardware & Electronics Engineer');

    const qHard4 = parseSearchQuery('get electronics');
    expect(qHard4.roles).toContain('Hardware & Electronics Engineer');

    // Software
    const qSoft1 = parseSearchQuery('graduate engineer trainee software');
    expect(qSoft1.roles).toContain('Software Engineer');
    expect(qSoft1.occupationalCategory).toBe('SOFTWARE_ENGINEERING');

    const qSoft2 = parseSearchQuery('get software');
    expect(qSoft2.roles).toContain('Software Engineer');
    expect(qSoft2.occupationalCategory).toBe('SOFTWARE_ENGINEERING');
  });

  it('15. Leaves generic GET / Graduate Engineer Trainee roles unresolved (does not default to Software Engineer)', () => {
    const qGen1 = parseSearchQuery('graduate engineer trainee');
    expect(qGen1.roles).not.toContain('Software Engineer');
    expect(qGen1.occupationalCategory).not.toBe('SOFTWARE_ENGINEERING');
    expect(qGen1.experienceLevel).toBe('FRESHER'); // It should still identify as fresher

    const qGen2 = parseSearchQuery('GET');
    expect(qGen2.roles).not.toContain('Software Engineer');
    expect(qGen2.occupationalCategory).not.toBe('SOFTWARE_ENGINEERING');
    expect(qGen2.experienceLevel).toBe('FRESHER');
  });
});

describe('Phase 12: Search Intelligence — Autocomplete & Suggestions', () => {
  it('provides default diverse starter suggestions on empty query', () => {
    const suggestions = getSearchSuggestions('');
    expect(suggestions.length).toBeGreaterThanOrEqual(5);
    expect(suggestions.some((s) => s.text.includes('Fresher'))).toBe(true);
    expect(suggestions.some((s) => s.categoryLabel === 'Finance' || s.categoryLabel === 'Human Resources' || s.categoryLabel === 'Design')).toBe(true);
  });

  it('suggests roles and skills for "java"', () => {
    const suggestions = getSearchSuggestions('java');
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    expect(suggestions.some((s) => s.text.toLowerCase().includes('java'))).toBe(true);
  });

  it('suggests locations for "bang"', () => {
    const suggestions = getSearchSuggestions('bang');
    expect(suggestions.some((s) => s.text.includes('Bangalore'))).toBe(true);
  });

  it('suggests roles for "fresher"', () => {
    const suggestions = getSearchSuggestions('fresher');
    expect(suggestions.some((s) => s.text.toLowerCase().includes('fresher'))).toBe(true);
  });
});
