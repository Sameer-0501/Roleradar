import 'dotenv/config';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq, and } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function extractJobs() {
  const db = getDb();
  
  const conditions = [
    eq(schema.jobs.status, 'ACTIVE'),
    eq(schema.jobs.verification_status, 'VERIFIED')
  ];

  const jobs = await db
    .select({
      title: schema.jobs.title,
    })
    .from(schema.jobs)
    .where(and(...conditions));
    
  console.log(`Found ${jobs.length} ACTIVE + VERIFIED jobs.`);
  
  // Group by title to see frequencies
  const titleCounts: Record<string, number> = {};
  for (const job of jobs) {
    const title = job.title;
    titleCounts[title] = (titleCounts[title] || 0) + 1;
  }
  
  // Sort by count descending
  const sortedTitles = Object.entries(titleCounts)
    .sort((a, b) => b[1] - a[1]);

  const output = sortedTitles.map(([title, count]) => `${count}x | ${title}`).join('\n');
  
  fs.writeFileSync(path.join(__dirname, '../../scratch/job_inventory.txt'), output);
  console.log('Written to scratch/job_inventory.txt');
  
  process.exit(0);
}

extractJobs().catch(err => {
  console.error(err);
  process.exit(1);
});
