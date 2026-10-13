import 'dotenv/config';
import { seedSources } from '../pipeline/source-seeder.js';
import { runPipeline } from '../pipeline/pipeline.js';
import { createCollectorForSource } from '../sources/source-factory.js';
import { SOURCE_CATALOG } from '../sources/catalog.js';
import { closeConnection } from '../database/connection.js';

async function main() {
  console.log('[Phase 20.2] Testing SmartRecruiters pipeline...');
  const seedMap = await seedSources();

  // Test 1-2 external employers
  const sourcesToScan = [
    'PhonePe',
  ];

  for (const companyName of sourcesToScan) {
    const sourceDef = SOURCE_CATALOG.find((s) => s.companyName === companyName);
    if (!sourceDef) continue;
    const companyId = seedMap.get(companyName);
    if (!companyId) continue;

    console.log(`\n▶ Scanning ${companyName} (${sourceDef.atsType})...`);
    try {
      const collector = createCollectorForSource(sourceDef);
      const candidates = await collector.discoverJobs();
      console.log(`  Discovered ${candidates.length} candidate jobs for ${companyName}`);

      let verifyConfig: Record<string, unknown> = {
        officialDomain: sourceDef.officialDomain,
        sourceSystem: 'SMARTRECRUITERS',
        smartrecruitersConfig: {
          companyIdentifier: sourceDef.config.companyIdentifier,
        },
      };

      const stats = await runPipeline(candidates, companyId, verifyConfig as any);
      console.log(`  ✓ Pipeline completed for ${companyName}: total=${stats.total}, verified=${stats.verified}, failed=${stats.failed}, pending=${stats.pending}`);
    } catch (err) {
      console.error(`  ❌ Error processing ${companyName}:`, err instanceof Error ? err.message : String(err));
    }
  }

  await closeConnection();
  console.log('\n[Done] Pipeline test complete.');
}

main().catch(async (e) => {
  console.error(e);
  await closeConnection();
});
