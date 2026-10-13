import 'dotenv/config';
import { runRecentSourceSweep } from '../pipeline/recent-source-sweep.js';
import { GreenhouseCollector } from '../collectors/ats/greenhouse-collector.js';
import { Pool } from 'pg';
import { getCompanyById } from '../companies/company-service.js';
import { pino } from 'pino';
import { ConfigLoader } from '../config/config.js';
import { getSourceConfig } from '../jobs/job-service.js'; // Fallback import or remove if not needed; will use direct db query in script

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error('Usage: tsx run-recent-sweep.ts <companyId>');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  
  // We just construct a hardcoded dummy config for testing since it requires just pipeline configuration
  const config = {
    sourceType: 'GREENHOUSE',
    sourceSystem: 'GREENHOUSE',
    boardToken: 'gitlab',
    baseUrl: 'https://boards-api.greenhouse.io/v1/boards/gitlab/jobs',
    companyId: companyId,
    officialDomain: 'job-boards.greenhouse.io'
  } as any;
  
  console.log(`Running sweep for company ${companyId}...`);
  const collector = new GreenhouseCollector({
    boardToken: 'gitlab',
    companyName: 'GitLab',
    officialDomain: 'job-boards.greenhouse.io'
  });
  const stats = await runRecentSourceSweep(
    collector,
    companyId,
    config,
    { windowDays: 10 }
  );
  
  console.log('Sweep completed.', stats);
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
