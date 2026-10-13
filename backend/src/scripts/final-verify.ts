import 'dotenv/config';
import { parseExperienceRequirements } from '../matching/experience-parser.js';
import { matchExperience } from '../matching/experience-matcher.js';
import { evaluateJobFreshness } from '../matching/relevance/freshness-evaluator.js';
import { matchRole } from '../matching/role-matcher.js';

async function main() {
  console.log('=====================================================');
  console.log('1. FRESHER NOTIFICATION SAFETY');
  console.log('=====================================================');
  
  // A) Fresher + Experienced Job
  const srExp = parseExperienceRequirements('Senior Backend Engineer', 'Looking for 5+ years of experience.', '');
  const matchA = matchExperience(srExp, 'FRESHER');
  console.log(`A) Senior Job matched for Fresher? ${matchA.matched} | Reason: ${matchA.reason}`);

  // B) Fresher + Unknown Job
  const unkExp = parseExperienceRequirements('Backend Engineer', 'We are looking for a developer.', '');
  const matchB = matchExperience(unkExp, 'FRESHER');
  console.log(`B) Unknown Job matched for Fresher? ${matchB.matched} | Reason: ${matchB.reason}`);

  // C) Fresher + Fresher Job
  const freshExp = parseExperienceRequirements('Graduate Software Engineer', 'Entry level position for recent grads.', '');
  const matchC = matchExperience(freshExp, 'FRESHER');
  console.log(`C) Entry Level matched for Fresher? ${matchC.matched} | Reason: ${matchC.reason}`);

  console.log('\n=====================================================');
  console.log('2. FRESHNESS BOUNDARY TEST');
  console.log('=====================================================');
  
  const now = new Date('2026-09-01T12:00:00Z');
  const ms = 1000 * 60; // 1 minute
  
  const t47_59 = new Date(now.getTime() - (48 * 60 * 60 * 1000) + ms); // 47h 59m
  const t48_00 = new Date(now.getTime() - (48 * 60 * 60 * 1000));      // 48h 00m
  const t48_01 = new Date(now.getTime() - (48 * 60 * 60 * 1000) - ms); // 48h 01m

  const t167_59 = new Date(now.getTime() - (168 * 60 * 60 * 1000) + ms); // 167h 59m
  const t168_00 = new Date(now.getTime() - (168 * 60 * 60 * 1000));      // 168h 00m
  const t168_01 = new Date(now.getTime() - (168 * 60 * 60 * 1000) - ms); // 168h 01m

  console.log(`47h 59m old:`, evaluateJobFreshness(t47_59, t47_59, t47_59, now).state);
  console.log(`48h 00m old:`, evaluateJobFreshness(t48_00, t48_00, t48_00, now).state);
  console.log(`48h 01m old:`, evaluateJobFreshness(t48_01, t48_01, t48_01, now).state);
  
  console.log(`167h 59m old:`, evaluateJobFreshness(t167_59, t167_59, t167_59, now).state);
  console.log(`168h 00m old:`, evaluateJobFreshness(t168_00, t168_00, t168_00, now).state);
  console.log(`168h 01m old:`, evaluateJobFreshness(t168_01, t168_01, t168_01, now).state);
  
  console.log(`officialPostedAt = NULL:`, evaluateJobFreshness(t47_59, t47_59, null, now).state);

  console.log('\n=====================================================');
  console.log('3. ROLE FAMILY VERIFICATION');
  console.log('=====================================================');
  
  const userRoles = ['Software Engineer'];
  const positive = [
    'Software Engineer', 'Software Developer', 'Associate Software Engineer',
    'Graduate Software Engineer', 'Junior Software Engineer', 'Backend Engineer',
    'Backend Developer', 'Frontend Engineer', 'Frontend Developer',
    'Full Stack Engineer', 'Full Stack Developer', 'Application Developer'
  ];
  const negative = [
    'Civil Engineer', 'Mechanical Engineer', 'Structural Engineer',
    'Electrical Engineer', 'Sales Engineer'
  ];

  for (const title of positive) {
    const res = matchRole(title, userRoles);
    console.log(`Positive Test -> "${title}" matched: ${res.matched}`);
  }
  for (const title of negative) {
    const res = matchRole(title, userRoles);
    console.log(`Negative Test -> "${title}" matched: ${res.matched}`);
  }
}
main();
