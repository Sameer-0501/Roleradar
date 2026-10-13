import 'dotenv/config';
import { seedSources } from '../pipeline/source-seeder.js';
import { runPipeline } from '../pipeline/pipeline.js';
import { createCollectorForSource } from '../sources/source-factory.js';
import { SOURCE_CATALOG } from '../sources/catalog.js';
import { closeConnection } from '../database/connection.js';

async function main() {
  const seedMap = await seedSources();
  for (const name of ['PubMatic', 'Groww']) {
    const sourceDef = SOURCE_CATALOG.find((s) => s.companyName === name);
    if (!sourceDef) continue;
    const companyId = seedMap.get(name);
    if (!companyId) continue;
    console.log(`Scanning ${name}...`);
    const collector = createCollectorForSource(sourceDef);
    const candidates = await collector.discoverJobs();
    console.log(`Discovered ${candidates.length} candidates for ${name}`);
    const stats = await runPipeline(candidates, companyId, {
      officialDomain: sourceDef.officialDomain,
      sourceSystem: sourceDef.atsType,
      boardToken: (sourceDef.config as any).boardToken,
    });
    console.log(`Result for ${name}: total=${stats.total}, verified=${stats.verified}`);
  }
  await closeConnection();
}

main().catch(async (e) => {
  console.error(e);
  await closeConnection();
});
