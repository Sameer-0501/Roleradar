import pg from 'pg';
import { parseExperienceRequirements } from '../matching/experience-parser.js';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://kcarrier:kcarrier_dev_password@localhost:5433/kcarrier_jobs',
  });
  await client.connect();

  const res = await client.query(`
    SELECT c.name as company, j.title, j.location, j.description, j.requirements
    FROM jobs j JOIN companies c ON j.company_id = c.id
    WHERE j.status = 'ACTIVE' AND j.verification_status = 'VERIFIED'
  `);

  const cities = ['Pune', 'Chennai', 'Mumbai', 'Noida', 'Gurgaon', 'Gurugram', 'Delhi'];
  for (const city of cities) {
    const matched = res.rows.filter((r) => (r.location || '').toLowerCase().includes(city.toLowerCase()));
    console.log('\n====================================');
    console.log(`City: ${city} | Total Verified Jobs: ${matched.length}`);
    console.log('====================================');
    matched.forEach((m) => {
      const exp = parseExperienceRequirements(m.title, m.description, m.requirements);
      console.log(`  • [${m.company}] ${m.title} (${m.location}) -> ${exp.classification} (${exp.reason})`);
    });
  }

  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
