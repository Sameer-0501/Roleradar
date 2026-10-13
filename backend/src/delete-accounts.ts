import 'dotenv/config';
import { getDb } from './database/connection.js';
import { schema } from './database/index.js';
import { sql, notInArray } from 'drizzle-orm';

async function run() {
  const db = getDb();
  try {
    const keptEmails = ['same60806@gmail.com', 'b10854752@gmail.com'];
    
    // Check how many users exist first
    const beforeCount = await db.select({ count: sql<number>`count(*)` }).from(schema.users);
    console.log(`Total users before deletion: ${beforeCount[0].count}`);

    // Try deleting users not in the list
    const result = await db.delete(schema.users)
      .where(notInArray(schema.users.email, keptEmails))
      .returning({ id: schema.users.id, email: schema.users.email });

    console.log(`Successfully deleted ${result.length} accounts.`);
    
    const afterCount = await db.select({ count: sql<number>`count(*)` }).from(schema.users);
    console.log(`Total users remaining: ${afterCount[0].count}`);

    process.exit(0);
  } catch (error) {
    console.error('Error deleting accounts:', error);
    process.exit(1);
  }
}

run();
