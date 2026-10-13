import 'dotenv/config';
import { seedSources } from '../pipeline/source-seeder.js';
import { runPipeline } from '../pipeline/pipeline.js';
import { createCollectorForSource } from '../sources/source-factory.js';
import { SOURCE_CATALOG } from '../sources/catalog.js';
import { closeConnection } from '../database/connection.js';

const INTERNATIONAL_COMPANIES = [
  'Deliveroo',
  'Monzo',
  'Celonis',
  'DeepL',
  'Adyen',
  'Canva',
  'Intercom',
  'Sentry',
  'Temporal',
  'Weights & Biases',
  'Sourcegraph',
  '1Password',
  'Vercel',
];

async function main() {
  console.log('Seeding all 80 catalog sources into database...');
  const seedMap = await seedSources();
  console.log('Successfully seeded ' + seedMap.size + ' companies.');

  console.log('\n--- SCANNING PHASE 8.2 INTERNATIONAL SOURCES ---');
  let totalDiscovered = 0;
  let totalVerified = 0;

  for (const companyName of INTERNATIONAL_COMPANIES) {
    const sourceDef = SOURCE_CATALOG.find((s) => s.companyName === companyName);
    if (!sourceDef) {
      console.log('[WARN] Company ' + companyName + ' not found in catalog.');
      continue;
    }

    const companyId = seedMap.get(companyName);
    if (!companyId) {
      console.log('[WARN] Company ID not found for ' + companyName + '.');
      continue;
    }

    try {
      console.log('Scanning [' + sourceDef.atsType + '] ' + companyName + '...');
      const collector = createCollectorForSource(sourceDef);
      const candidates = await collector.discoverJobs();
      console.log(' -> Discovered ' + candidates.length + ' candidate jobs for ' + companyName);
      totalDiscovered += candidates.length;

      const stats = await runPipeline(candidates, companyId, {
        officialDomain: sourceDef.officialDomain,
        sourceSystem: sourceDef.atsType,
        ...(sourceDef.atsType === 'GREENHOUSE' ? { boardToken: (sourceDef.config as any).boardToken } : {}),
        ...(sourceDef.atsType === 'LEVER' ? { siteToken: (sourceDef.config as any).siteToken } : {}),
        ...(sourceDef.atsType === 'ASHBY' ? { jobBoardName: (sourceDef.config as any).jobBoardName } : {}),
      });

      console.log(' -> Pipeline completed for ' + companyName + ': verified=' + stats.verified + ', failed=' + stats.failed);
      totalVerified += stats.verified;
    } catch (err: any) {
      console.error('[ERROR] Failed scanning ' + companyName + ':', err.message);
    }
  }

  console.log('\nScan complete! Total discovered: ' + totalDiscovered + ', Total verified: ' + totalVerified);
  await closeConnection();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Fatal error during international scan:', err);
  await closeConnection();
  process.exit(1);
});
