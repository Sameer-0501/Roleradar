import 'dotenv/config';
import { matchRole } from '../matching/role-matcher.js';

const testTitles = [
  'Associate Software Engineer',
  'Graduate Engineer Trainee',
  'GET - Software Engineering',
  'Software Engineer I',
  'Software Engineer 1',
  'SDE 1',
  'SDE-I',
  'Associate Developer',
  'Junior Software Engineer',
  'Software Engineer',
  'Software Developer',
  'Full Stack Developer',
  'Backend Developer',
  'Frontend Developer',
  'Java Developer',
  'Python Developer',
  'DevOps Engineer',
  'QA Engineer',
  'Data Engineer',
  'Data Analyst',
];

const userRoles = [
  'Software Engineer',
  'Frontend Developer',
  'Java Developer',
  'Full Stack Developer',
  'Backend Developer',
  'Data Engineer',
  'QA Engineer',
];

for (const t of testTitles) {
  const result = matchRole(t, userRoles);
  console.log(`Title: "${t.padEnd(35)}" => Matched: ${result.matched ? 'YES (' + result.canonicalRole + ')' : 'NO'}`);
}
