import 'dotenv/config';
import { seedSources } from '../pipeline/source-seeder.js';
import { runPipeline } from '../pipeline/pipeline.js';
import { createCollectorForSource } from '../sources/source-factory.js';
import { SOURCE_CATALOG } from '../sources/catalog.js';
import { closeConnection } from '../database/connection.js';

const PRIORITY_COMPANIES = [
  'Paytm',
  'Epifi',
  'Elastic',
  'Datadog',
  'Observe.ai',
  'Mindtickle',
  'Zeta',
  'Meesho',
  'Groww',
  'HackerRank',
  'PubMatic',
  'Atlan',
  'DevRev',
  'Sprinto',
  'DhiWise',
  'Toast',
  'Roblox',
];

async function main() {
  console.log('-------------------------------------------------------------------');
  console.log('      ROLE RADAR PHASE 8.1B SEEDING & INGESTION PIPELINE           ');
  console.log('-------------------------------------------------------------------\n');

  console.log('[1/3] Seeding source catalog into database...');
  const seedMap = await seedSources();
  console.log(`? Seeded ${seedMap.size} company sources successfully.\n`);

  console.log('[2/3] Scanning priority Indian tech employers...');
  let totalDiscovered = 0;
  let totalVerified = 0;

  for (const companyName of PRIORITY_COMPANIES) {
    const sourceDef = SOURCE_CATALOG.find((s) => s.companyName === companyName);
    if (!sourceDef) {
      console.warn(`?? Source definition not found in catalog for: ${companyName}`);
      continue;
    }

    const companyId = seedMap.get(companyName);
    if (!companyId) {
      console.warn(`?? Company ID not found for: ${companyName}`);
      continue;
    }

    console.log(`\n? Starting discovery & pipeline for ${companyName} (${sourceDef.atsType})...`);
    try {
      const collector = createCollectorForSource(sourceDef);
      const candidates = await collector.discoverJobs();
      console.log(`  Discovered ${candidates.length} raw job postings from ${companyName}`);
      totalDiscovered += candidates.length;

      if (candidates.length === 0) continue;

      let sourceSpecificConfig: Record<string, any> = {};
      if (sourceDef.atsType === 'GREENHOUSE') {
        sourceSpecificConfig = {
          boardToken: (sourceDef.config as any).boardToken,
        };
      } else if (sourceDef.atsType === 'LEVER') {
        sourceSpecificConfig = {
          siteToken: (sourceDef.config as any).siteToken,
        };
      } else if (sourceDef.atsType === 'ASHBY') {
        sourceSpecificConfig = {
          jobBoardName: (sourceDef.config as any).jobBoardName,
        };
      } else if (sourceDef.atsType === 'CUSTOM') {
        sourceSpecificConfig = {
          perJobApiEndpointTemplate: (sourceDef.config as any).perJobApiEndpointTemplate,
        };
      }

      const stats = await runPipeline(candidates, companyId, {
        officialDomain: sourceDef.officialDomain,
        sourceSystem: sourceDef.atsType,
        ...sourceSpecificConfig,
      });

      totalVerified += stats.verified;
      console.log(
        `  ? Pipeline completed for ${companyName}: total=${stats.total}, verified=${stats.verified}, failed=${stats.failed}, pending=${stats.pending}`
      );
    } catch (err: any) {
      console.error(`  ? Error processing ${companyName}: ${err.message}`);
    }
  }

  console.log('\n[3/3] Ingestion complete.');
  console.log(`Total Discovered in Batch: ${totalDiscovered}`);
  console.log(`Total Verified in Batch: ${totalVerified}\n`);

  await closeConnection();
  process.exit(0);
}

main().catch(async (e) => {
  console.error('Fatal error during Phase 8.1B ingestion:', e);
  await closeConnection();
  process.exit(1);
});
