import 'dotenv/config';
import { getDb } from '../database/connection.js';
import * as schema from '../database/schema.js';
import { eq } from 'drizzle-orm';

async function checkCandidates() {
  const db = getDb();
  const users = await db.select().from(schema.users);

  console.log('--- USERS IN DATABASE ---');
  for (const u of users) {
    const resumes = await db.select().from(schema.resumes).where(eq(schema.resumes.user_id, u.id));
    const skills = await db.select().from(schema.candidateSkills).where(eq(schema.candidateSkills.user_id, u.id));
    const educations = await db.select().from(schema.candidateEducations).where(eq(schema.candidateEducations.user_id, u.id));
    const evidence = await db.select().from(schema.candidateEvidence).where(eq(schema.candidateEvidence.user_id, u.id));
    const variants = await db.select().from(schema.resumeDocuments).where(eq(schema.resumeDocuments.user_id, u.id));
    console.log(`User: ${u.email} (${u.id})`);
    console.log(`  Resumes: ${resumes.length}, Skills: ${skills.length}, Educations: ${educations.length}, Evidence: ${evidence.length}, Variants: ${variants.length}`);
    if (resumes.length > 0) {
      console.log(`  Resume files:`, resumes.map(r => `${r.filename} (active: ${r.is_active})`));
    }
    if (educations.length > 0) {
      console.log(`  Educations:`, educations.map(e => `${e.degree} from ${e.institution}`));
    }
    if (skills.length > 0) {
      console.log(`  Skills:`, skills.map(s => s.canonical_name));
    }
  }
}

checkCandidates().catch(console.error).finally(() => process.exit(0));
