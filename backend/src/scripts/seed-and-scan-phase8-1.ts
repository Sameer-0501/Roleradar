import 'dotenv/config';
import { seedSources } from '../pipeline/source-seeder.js';
import { runPipeline } from '../pipeline/pipeline.js';
import { createCollectorForSource } from '../sources/source-factory.js';
import { SOURCE_CATALOG } from '../sources/catalog.js';
import { closeConnection } from '../database/connection.js';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('       ROLERADAR PHASE 8.1 SEED & INGESTION PIPELINE EXECUTION       ');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  console.log(`[1/3] Seeding ${SOURCE_CATALOG.length} sources into database...`);
  const seedMap = await seedSources();
  console.log(`[1/3] Successfully seeded ${seedMap.size} companies.`);

  const prioritySources = [
    // Phase 8.1 High-Value Additions
    'Meesho',
    'Razorpay',
    'HackerRank',
    'Atlan',
    'Bosch India',
    'Freshworks',
    'Druva',
    'PubMatic',
    'Mindtickle',
    'HighLevel',
    'Glance',
    'Adobe',
    'Salesforce',
    'BrowserStack',
    // Key existing sources with India footprint
    'Postman',
    'InMobi',
    'Groww',
    'CRED',
  ];

  console.log(`\n[2/3] Scanning and verifying ${prioritySources.length} priority Indian & target sources...`);

  for (const companyName of prioritySources) {
    const sourceDef = SOURCE_CATALOG.find((s) => s.companyName === companyName);
    if (!sourceDef) {
      console.warn(`  ⚠️ Source definition not found for ${companyName}`);
      continue;
    }
    const companyId = seedMap.get(companyName);
    if (!companyId) {
      console.warn(`  ⚠️ Company ID not found for ${companyName}`);
      continue;
    }

    console.log(`\n▶ Scanning ${companyName} (${sourceDef.atsType})...`);
    try {
      const collector = createCollectorForSource(sourceDef);
      const candidates = await collector.discoverJobs();
      console.log(`  Discovered ${candidates.length} candidate jobs for ${companyName}`);

      let verifyConfig: Record<string, unknown> = {
        officialDomain: sourceDef.officialDomain,
        sourceSystem: (sourceDef.atsType === 'ASHBY' || sourceDef.atsType === 'WORKABLE') ? 'CUSTOM' : sourceDef.atsType,
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

      // Process candidates through the full verification pipeline
      const stats = await runPipeline(candidates, companyId, verifyConfig as any);
      console.log(`  ✓ Pipeline completed for ${companyName}: total=${stats.total}, verified=${stats.verified}, failed=${stats.failed}, pending=${stats.pending}`);
    } catch (err) {
      console.error(`  ❌ Error processing ${companyName}:`, err instanceof Error ? err.message : String(err));
    }
  }

  console.log('\n[3/3] Ingestion complete. Database is updated with verified Indian opportunities.');
  await closeConnection();
}

main().catch(async (e) => {
  console.error(e);
  await closeConnection();
});
