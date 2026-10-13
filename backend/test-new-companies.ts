import 'dotenv/config';
import { getDb } from './src/database/connection.js';
import { SOURCE_CATALOG } from './src/sources/catalog.js';
import { runPipeline } from './src/pipeline/pipeline.js';
import { createCollectorForSource } from './src/sources/source-factory.js';
import { seedSources } from './src/pipeline/source-seeder.js';
import { closeConnection } from './src/database/connection.js';

async function syncAndScan() {
  const seedMap = await seedSources();
  console.log(`Seeded ${seedMap.size} companies.`);
  
  const targetCompanies = [
  'Accenture',
];
  
  for (const companyName of targetCompanies) {
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

      const stats = await runPipeline(candidates, companyId, verifyConfig as any);
      console.log(`  Pipeline result for ${companyName}: total=${stats.total}, verified=${stats.verified}, failed=${stats.failed}`);
    } catch (err) {
      console.error(`  Error scanning ${companyName}:`, err instanceof Error ? err.message : String(err));
    }
  }
  
  await closeConnection();
}

syncAndScan().catch(err => {
  console.error(err);
  process.exit(1);
});
