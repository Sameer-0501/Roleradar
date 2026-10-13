import 'dotenv/config';
import { parseExperienceRequirements } from '../matching/experience-parser.js';

const titlesToTest = [
  'Associate Vice President - Regulatory Compliance',
  'Associate Director - Delivery',
  'Associate Lead Data Scientist',
  'Associate Manager- Presales',
  'Associate Software Engineer',
  'Graduate Engineer Trainee',
  'GET - Software Engineering',
  'Software Engineer I',
  'Software Engineer 1',
  'SDE 1',
  'SDE-I',
  'Member of Technical Staff 1',
  'Junior Software Engineer',
  'Software Engineer',
  'Senior Software Engineer',
  'Staff Software Engineer',
  'Lead Software Engineer',
  'Principal Engineer',
  'Director of Engineering',
  'Engineering Manager',
  'Head of Engineering',
  'VP of Engineering',
  'SDE II',
  'SDE III',
  'Software Engineer 2',
  'Software Engineer II',
  'Software Engineer III',
];

for (const t of titlesToTest) {
  const parsed = parseExperienceRequirements(t, '', '');
  console.log(`Title: "${t.padEnd(50)}" => ${parsed.classification} (isFresher: ${parsed.isFresher}, isExp: ${parsed.isExperienced})`);
}
