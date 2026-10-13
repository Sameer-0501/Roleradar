import 'dotenv/config';
import { seedSources } from '../pipeline/source-seeder.js';
import { runPipeline } from '../pipeline/pipeline.js';
import { createCollectorForSource } from '../sources/source-factory.js';
import { SOURCE_CATALOG } from '../sources/catalog.js';
import { closeConnection } from '../database/connection.js';

async function main() {
  console.log(`[Seeder] Seeding ${SOURCE_CATALOG.length} sources into database...`);
  const seedMap = await seedSources();
  console.log(`[Seeder] Successfully seeded ${seedMap.size} companies.`);

  const newSourcesToScan = [
    'Postman',
    'Freshworks',
    'InMobi',
    'Groww',
    'CRED',
    'Notion',
    'Anthropic',
    'Supabase',
    'Perplexity',
    'Replit',
    'Cohere',
    'Scale AI',
  ];

  for (const companyName of newSourcesToScan) {
    const sourceDef = SOURCE_CATALOG.find((s) => s.companyName === companyName);
    if (!sourceDef) continue;
    const companyId = seedMap.get(companyName);
    if (!companyId) continue;

    console.log(`\n[Scan] Scanning ${companyName} (${sourceDef.atsType})...`);
    try {
      const collector = createCollectorForSource(sourceDef);
      const candidates = await collector.discoverJobs();
      console.log(`  Discovered ${candidates.length} candidate jobs for ${companyName}`);

      let verifyConfig: Record<string, unknown> = {
        officialDomain: sourceDef.officialDomain,
        sourceSystem: sourceDef.atsType === 'ASHBY' ? 'CUSTOM' : sourceDef.atsType,
      };
      if (sourceDef.atsType === 'GREENHOUSE') verifyConfig = { ...verifyConfig, boardToken: (sourceDef.config as any).boardToken };
      if (sourceDef.atsType === 'LEVER') verifyConfig = { ...verifyConfig, siteToken: (sourceDef.config as any).siteToken };
      if (sourceDef.atsType === 'WORKDAY') verifyConfig = { ...verifyConfig, workdayConfig: sourceDef.config };
      if (sourceDef.atsType === 'CUSTOM') verifyConfig = { ...verifyConfig, customConfig: sourceDef.config };
      if (sourceDef.atsType === 'ASHBY') verifyConfig = { ...verifyConfig, ashbyConfig: sourceDef.config };

      const stats = await runPipeline(candidates.slice(0, 30), companyId, verifyConfig as any);
      console.log(`  Pipeline result for ${companyName}: total=${stats.total}, verified=${stats.verified}, failed=${stats.failed}`);
    } catch (err) {
      console.error(`  Error scanning ${companyName}:`, err instanceof Error ? err.message : String(err));
    }
  }

  await closeConnection();
  console.log('\n[Done] Seeding and scanning complete.');
}

main().catch(async (e) => {
  console.error(e);
  await closeConnection();
});
