import 'dotenv/config';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { eq } from 'drizzle-orm';

async function main() {
  const email = 'alerts.careers@gmail.com';
  console.log(`Setting is_admin=true for ${email}...`);
  try {
    const db = getDb();
    const result = await db.update(schema.users)
      .set({ is_admin: true })
      .where(eq(schema.users.email, email))
      .returning();
      
    if (result.length > 0) {
      console.log(`Success! User ${result[0].email} is now an admin.`);
    } else {
      console.log(`Error: Could not find user with email ${email}`);
    }
  } catch (error) {
    console.error('Failed:', error);
  } finally {
    process.exit(0);
  }
}

main();
