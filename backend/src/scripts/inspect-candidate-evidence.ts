import 'dotenv/config';
import { getDb } from '../database/connection.js';
import * as schema from '../database/schema.js';
import { eq } from 'drizzle-orm';

async function inspectCandidateDetails() {
  const db = getDb();
  const userId = 'ee9c7230-e25f-4163-9675-b6c29e7b013a';

  const evidence = await db.select().from(schema.candidateEvidence).where(eq(schema.candidateEvidence.user_id, userId));
  console.log(`EVIDENCE ROWS FOR USER (${evidence.length}):`);
  for (const ev of evidence) {
    console.log(`- [${ev.evidence_type}] (${ev.verified_status}) "${ev.claim_text}" | refId: ${ev.reference_id}`);
  }

  const educations = await db.select().from(schema.candidateEducations).where(eq(schema.candidateEducations.user_id, userId));
  console.log(`\nEDUCATIONS ROWS FOR USER (${educations.length}):`);
  for (const ed of educations) {
    console.log(`- id: ${ed.id} | ${ed.degree} in ${ed.field_of_study} from ${ed.institution} (${ed.start_year}-${ed.end_year})`);
  }

  const skills = await db.select().from(schema.candidateSkills).where(eq(schema.candidateSkills.user_id, userId));
  console.log(`\nSKILLS ROWS FOR USER (${skills.length}):`);
  for (const sk of skills) {
    console.log(`- id: ${sk.id} | ${sk.skill_name} (${sk.canonical_name}) [${sk.category}] src: ${sk.source}`);
  }

  const careerProfile = await db.select().from(schema.candidateCareerProfiles).where(eq(schema.candidateCareerProfiles.user_id, userId));
  console.log(`\nCAREER PROFILE:`, careerProfile);

  const variants = await db.select().from(schema.resumeDocuments).where(eq(schema.resumeDocuments.user_id, userId));
  console.log(`\nVARIANTS:`, variants);
}

inspectCandidateDetails().catch(console.error).finally(() => process.exit(0));

