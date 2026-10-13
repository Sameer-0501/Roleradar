import 'dotenv/config';
import { findMatchesForUser } from '../matching/matching-service.js';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq } from 'drizzle-orm';
import fs from 'fs';

async function run() {
  const db = getDb();
  
  const users = await db.select().from(schema.users).limit(1);
  if (users.length === 0) {
    console.error("No users found.");
    process.exit(1);
  }
  const userId = users[0].id;
  
  const testCases = [
    { name: "All Roles", options: { roleFilter: 'ALL', limit: 100 } },
    { name: "Business Analyst", options: { roleFilter: 'Business Analyst', limit: 100 } },
    { name: "Java Developer", options: { roleFilter: 'Java Developer', limit: 100 } },
    { name: "Python Developer", options: { roleFilter: 'Python Developer', limit: 100 } },
    { name: "Bangalore", options: { location: 'Bangalore', limit: 100 } },
    { name: "Hyderabad", options: { location: 'Hyderabad', limit: 100 } },
    { name: "India Remote", options: { location: 'India', workplace: 'REMOTE' as const, limit: 100 } },
    { name: "ONSITE", options: { workplace: 'ONSITE' as const, limit: 100 } },
    { name: "HYBRID", options: { workplace: 'HYBRID' as const, limit: 100 } },
    { name: "REMOTE", options: { workplace: 'REMOTE' as const, limit: 100 } },
    { name: "FRESHER", options: { experience: 'FRESHER' as const, limit: 100 } },
    { name: "EXPERIENCED", options: { experience: 'EXPERIENCED' as const, limit: 100 } },
    { name: "UNKNOWN", options: { experience: 'UNKNOWN' as const, limit: 100 } },
    { name: "company selection", options: { companyId: 'some-company-id', limit: 100 } },
    { name: "empty company selection", options: { companyId: '', limit: 100 } },
    { name: "ACTIVE only", options: { limit: 100 } }
  ];

  const companies = await db.select().from(schema.companies).limit(1);
  if (companies.length > 0) {
    testCases.find(tc => tc.name === "company selection")!.options.companyId = companies[0].id;
  }

  const results: Record<string, string[]> = {};
  
  for (const tc of testCases) {
    const res = await findMatchesForUser(userId, tc.options as any);
    results[tc.name] = res.jobs.map(j => j.id);
  }
  
  fs.writeFileSync('baseline-results.json', JSON.stringify(results, null, 2));
  console.log("Baseline captured in baseline-results.json");
  process.exit(0);
}

run().catch(console.error);
