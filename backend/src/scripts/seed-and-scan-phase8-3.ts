import 'dotenv/config';
import { seedSources } from '../pipeline/source-seeder.js';
import { runPipeline } from '../pipeline/pipeline.js';
import { createCollectorForSource } from '../sources/source-factory.js';
import { SOURCE_CATALOG } from '../sources/catalog.js';
import { closeConnection } from '../database/connection.js';

interface ScanReport {
  company: string;
  ats: string;
  startedAt: string;
  completedAt: string;
  discovered: number;
  verified: number;
  failed: number;
  durationMs: number;
  health: string;
}

const TARGET_COMPANIES = [
  'Paytm',
  'Sarvam AI',
  'Fi Money',
  'Sigmoid',
  'SingleStore',
  'Observe.AI',
  'Cisco',
  'Target',
  'CrowdStrike',
  'ElevenLabs',
  'Karat',
  'Neo4j',
  'Cresta',
  'Yugabyte',
];

async function main() {
  console.log('=== ROLE RADAR: PHASE 8.3 SEED AND SCAN ===');
  console.log(`[1/3] Seeding ${SOURCE_CATALOG.length} catalog sources into PostgreSQL...`);
  const seedMap = await seedSources();
  console.log(`[✓] Successfully seeded/verified ${seedMap.size} database companies.`);

  console.log('\n[2/3] Executing runtime discovery and live verification scans...');
  const reports: ScanReport[] = [];

  let totalDiscovered = 0;
  let totalVerified = 0;
  let totalFailed = 0;

  for (const companyName of TARGET_COMPANIES) {
    const sourceDef = SOURCE_CATALOG.find((s) => s.companyName === companyName);
    if (!sourceDef) {
      console.log(`[WARN] Company "${companyName}" not found in catalog.`);
      continue;
    }

    const companyId = seedMap.get(companyName);
    if (!companyId) {
      console.log(`[WARN] Company ID not found for "${companyName}".`);
      continue;
    }

    const startTime = new Date();
    const startIso = startTime.toISOString().split('T')[1]?.substring(0, 8) || '';

    try {
      console.log(`\nScanning [${sourceDef.atsType}] ${companyName}...`);
      const collector = createCollectorForSource(sourceDef);
      const candidates = await collector.discoverJobs();
      console.log(` -> Discovered ${candidates.length} candidate jobs from ${sourceDef.officialDomain}`);

      // Construct strong pipeline source config
      let pipelineConfig: any = {
        officialDomain: sourceDef.officialDomain,
        sourceSystem: sourceDef.atsType,
      };

      if (sourceDef.atsType === 'GREENHOUSE') {
        pipelineConfig.boardToken = (sourceDef.config as any).boardToken;
      } else if (sourceDef.atsType === 'LEVER') {
        pipelineConfig.siteToken = (sourceDef.config as any).siteToken;
      } else if (sourceDef.atsType === 'ASHBY') {
        pipelineConfig.ashbyConfig = {
          jobBoardName: (sourceDef.config as any).jobBoardName,
        };
      } else if (sourceDef.atsType === 'WORKDAY') {
        pipelineConfig.workdayConfig = {
          host: (sourceDef.config as any).host,
          tenant: (sourceDef.config as any).tenant,
          clientSite: (sourceDef.config as any).clientSite ?? (sourceDef.config as any).site ?? '',
        };
      }

      const stats = await runPipeline(candidates, companyId, pipelineConfig);

      const endTime = new Date();
      const endIso = endTime.toISOString().split('T')[1]?.substring(0, 8) || '';
      const durationMs = endTime.getTime() - startTime.getTime();

      const health = stats.verified > 0 ? 'HEALTHY' : (candidates.length === 0 ? 'ZERO_POSTINGS' : 'DEGRADED');

      reports.push({
        company: companyName,
        ats: sourceDef.atsType,
        startedAt: startIso,
        completedAt: endIso,
        discovered: candidates.length,
        verified: stats.verified,
        failed: stats.failed,
        durationMs,
        health,
      });

      totalDiscovered += candidates.length;
      totalVerified += stats.verified;
      totalFailed += stats.failed;

      console.log(` -> Verified: ${stats.verified}, Failed: ${stats.failed}, Duration: ${durationMs}ms [${health}]`);
    } catch (err: any) {
      const endTime = new Date();
      const endIso = endTime.toISOString().split('T')[1]?.substring(0, 8) || '';
      const durationMs = endTime.getTime() - startTime.getTime();

      reports.push({
        company: companyName,
        ats: sourceDef.atsType,
        startedAt: startIso,
        completedAt: endIso,
        discovered: 0,
        verified: 0,
        failed: 0,
        durationMs,
        health: 'FAILED: ' + err.message,
      });

      console.error(`[ERROR] Failed scanning ${companyName}:`, err.message);
    }
  }

  console.log('\n[3/3] Runtime Scan Results Summary:');
  console.log('------------------------------------------------------------------------------------------------------------------------');
  console.log(
    'Company'.padEnd(16) +
    'ATS'.padEnd(14) +
    'Started'.padEnd(11) +
    'Completed'.padEnd(12) +
    'Discovered'.padStart(11) +
    'Verified'.padStart(10) +
    'Failed'.padStart(8) +
    'Duration'.padStart(11) +
    '  Health'.padEnd(12)
  );
  console.log('------------------------------------------------------------------------------------------------------------------------');

  for (const r of reports) {
    console.log(
      r.company.padEnd(16) +
      r.ats.padEnd(14) +
      r.startedAt.padEnd(11) +
      r.completedAt.padEnd(12) +
      String(r.discovered).padStart(11) +
      String(r.verified).padStart(10) +
      String(r.failed).padStart(8) +
      (r.durationMs + 'ms').padStart(11) +
      '  ' + r.health.padEnd(12)
    );
  }
  console.log('------------------------------------------------------------------------------------------------------------------------');
  console.log(`TOTAL: Discovered=${totalDiscovered}, Verified=${totalVerified}, Failed=${totalFailed}`);

  await closeConnection();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Fatal error during seed and scan:', err);
  await closeConnection();
  process.exit(1);
});
