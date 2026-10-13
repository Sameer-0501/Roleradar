import 'dotenv/config';
import { seedSources } from '../pipeline/source-seeder.js';
import { runPipeline } from '../pipeline/pipeline.js';
import { createCollectorForSource } from '../sources/source-factory.js';
import { SOURCE_CATALOG } from '../sources/catalog.js';
import { closeConnection } from '../database/connection.js';

async function main() {
  console.log('-------------------------------------------------------------------');
  console.log('        ROLE RADAR PHASE 8.1A SEED & SCAN PIPELINE INGESTION       ');
  console.log('-------------------------------------------------------------------\n');

  console.log('[1/3] Seeding all 67 sources in catalog into database...');
  const seedMap = await seedSources();
  console.log(`? Seed complete. Total active companies seeded: ${seedMap.size}\n`);

  console.log('[2/3] Scanning and live-verifying Phase 8.1A target Indian employers...');

  const prioritySources = [
    // Phase 8.1A new additions
    'MongoDB',
    'Okta',
    'Twilio',
    'Rubrik',
    'Samsara',
    'Toast',
    'Roblox',
    'Zeta',
    'DevRev',
    'Sprinto',
    'DhiWise',
    'Experian',
    'ServiceNow',

    // Existing high-value Indian employers
    'Glance',
    'InMobi',
    'HackerRank',
    'Groww',
    'Druva',
    'PubMatic',
    'Atlan',
    'Meesho',
    'CRED',
    'Mindtickle',
    'HighLevel',
    'Freshworks',
  ];

  let totalDiscovered = 0;
  let totalVerified = 0;

  for (const companyName of prioritySources) {
    const sourceDef = SOURCE_CATALOG.find((s) => s.companyName === companyName);
    if (!sourceDef) continue;
    const companyId = seedMap.get(companyName);
    if (!companyId) {
      console.warn(`?? Company ID not found for ${companyName}`);
      continue;
    }

    console.log(`\n? [${sourceDef.atsType}] ${companyName} ...`);
    try {
      const collector = createCollectorForSource(sourceDef);
      const candidates = await collector.discoverJobs();
      console.log(`  Discovered ${candidates.length} candidate jobs for ${companyName}`);
      totalDiscovered += candidates.length;

      let verifyConfig: Record<string, unknown> = {
        officialDomain: sourceDef.officialDomain,
        sourceSystem:
          sourceDef.atsType === 'ASHBY' || sourceDef.atsType === 'WORKABLE'
            ? 'CUSTOM'
            : sourceDef.atsType,
      };

      if (sourceDef.atsType === 'GREENHOUSE') {
        verifyConfig = { ...verifyConfig, boardToken: (sourceDef.config as any).boardToken };
      } else if (sourceDef.atsType === 'LEVER') {
        verifyConfig = { ...verifyConfig, siteToken: (sourceDef.config as any).siteToken };
      } else if (sourceDef.atsType === 'WORKDAY') {
        verifyConfig = { ...verifyConfig, workdayConfig: sourceDef.config };
      } else if (sourceDef.atsType === 'CUSTOM') {
        verifyConfig = {
          ...verifyConfig,
          customConfig: {
            perJobApiEndpointTemplate: (sourceDef.config as any).perJobApiEndpointTemplate,
          },
        };
      } else if (sourceDef.atsType === 'ASHBY') {
        verifyConfig = { ...verifyConfig, ashbyConfig: sourceDef.config };
      } else if (sourceDef.atsType === 'WORKABLE') {
        verifyConfig = { ...verifyConfig, workableConfig: sourceDef.config };
      }

      const stats = await runPipeline(candidates, companyId, verifyConfig as any);
      totalVerified += stats.verified;
      console.log(
        `  ? Pipeline completed for ${companyName}: total=${stats.total}, verified=${stats.verified}, failed=${stats.failed}, pending=${stats.pending}`
      );
    } catch (err) {
      console.error(
        `  ? Error processing ${companyName}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  console.log('\n[3/3] Ingestion complete.');
  console.log(`Total Discovered in Batch: ${totalDiscovered}`);
  console.log(`Total Verified in Batch: ${totalVerified}\n`);

  await closeConnection();
}

main().catch(async (e) => {
  console.error(e);
  await closeConnection();
});
