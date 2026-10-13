import 'dotenv/config';
import { seedSources } from '../pipeline/source-seeder.js';
import { runPipeline } from '../pipeline/pipeline.js';
import { createCollectorForSource } from '../sources/source-factory.js';
import { SOURCE_CATALOG } from '../sources/catalog.js';
import { closeConnection } from '../database/connection.js';

async function main() {
  console.log('[Rescan] Updating database seed with latest catalog...');
  const seedMap = await seedSources();

  const sourcesToScan = [
    'Freshworks',
    'Bosch India',
    'Druva',
    'PubMatic',
    'Mindtickle',
    'HackerRank',
  ];

  for (const companyName of sourcesToScan) {
    const sourceDef = SOURCE_CATALOG.find((s) => s.companyName === companyName);
    if (!sourceDef) continue;
    const companyId = seedMap.get(companyName);
    if (!companyId) continue;

    console.log(`\n▶ Rescanning ${companyName} (${sourceDef.atsType})...`);
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

      const stats = await runPipeline(candidates, companyId, verifyConfig as any);
      console.log(`  ✓ Pipeline completed for ${companyName}: total=${stats.total}, verified=${stats.verified}, failed=${stats.failed}, pending=${stats.pending}`);
    } catch (err) {
      console.error(`  ❌ Error processing ${companyName}:`, err instanceof Error ? err.message : String(err));
    }
  }

  await closeConnection();
  console.log('\n[Done] Rescan complete.');
}

main().catch(async (e) => {
  console.error(e);
  await closeConnection();
});
