import 'dotenv/config';
import { getDb } from './src/database/connection.js';
import { sql } from 'drizzle-orm';
import { schema } from './src/database/index.js';

async function checkCompanies() {
  const db = getDb();
  const list = [
    'Baxter', 'JLL', 'Cisco', '42Gears', 'Accenture', 'Fujitsu', 'Hevo Data', 
    'ZoomInfo', 'NatWest Group', 'Marmon Technologies India', 'Airbus', 
    'Oracle', 'Siemens', 'Pixoate', 'Amazon', 'Microsoft', 'Apple', 'BT Group', 
    'Tesco', 'HPE', 'F5', 'ProArch', 'ChampionX'
  ];

  for (const name of list) {
    const res = await db.select({ id: schema.companies.id, ats_type: schema.companies.ats_type, name: schema.companies.name }).from(schema.companies).where(sql`${schema.companies.name} ILIKE ${'%' + name + '%'}`);
    console.log(`${name}: ${res.length > 0 ? 'FOUND - ' + res[0].ats_type + ' (' + res[0].name + ')' : 'MISSING'}`);
  }
  process.exit(0);
}
checkCompanies();
