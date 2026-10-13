import 'dotenv/config';
import { getDb, closeConnection } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq } from 'drizzle-orm';
import { evaluateJobMatch } from '../matching/matching-service.js';
import type { CandidateJobData } from '../matching/matching-types.js';

async function main() {
  const db = getDb();
  
  const allJobs = await db
    .select({
      id: schema.jobs.id,
      companyId: schema.jobs.company_id,
      companyName: schema.companies.name,
      sourceSystem: schema.jobs.source_system,
      externalJobId: schema.jobs.external_job_id,
      title: schema.jobs.title,
      location: schema.jobs.location,
      workplaceType: schema.jobs.workplace_type,
      employmentType: schema.jobs.employment_type,
      officialUrl: schema.jobs.official_url,
      applyUrl: schema.jobs.apply_url,
      description: schema.jobs.description,
      requirements: schema.jobs.requirements,
      status: schema.jobs.status,
      verificationStatus: schema.jobs.verification_status,
      officialPostedAt: schema.jobs.official_posted_at,
      firstSeenAt: schema.jobs.first_seen_at,
      lastSeenAt: schema.jobs.last_seen_at,
    })
    .from(schema.jobs)
    .innerJoin(schema.companies, eq(schema.jobs.company_id, schema.companies.id));

  const userPrefData = {
    userId: 'ff9eee6c-7ed5-4caa-b5dd-8fb46c9b3580',
    roles: ['Software Engineer'],
    locations: ['Bangalore'],
    workplaceTypes: [],
    experienceLevel: 'FRESHER',
    companyIds: [],
    keywords: []
  };

  const matches = [];
  for (const job of allJobs) {
    const result = evaluateJobMatch(job as CandidateJobData, userPrefData as any);
    if (result.matched) {
      matches.push({ id: job.id, title: job.title, company: job.companyName });
    }
  }

  console.log(`Found ${matches.length} perfectly matching jobs in the entire DB for the fresher account.`);
  if (matches.length > 0) {
    console.log(matches.slice(0, 10));
  }
  await closeConnection();
}

main().catch(console.error);
