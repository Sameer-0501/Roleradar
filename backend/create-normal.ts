import 'dotenv/config';
import { getDb } from './src/database/connection.js';
import { schema } from './src/database/index.js';
import { eq } from 'drizzle-orm';
import { hashPassword } from './src/auth/password.js';

async function main() {
  const db = getDb();
  
  const existing = await db.select().from(schema.users).where(eq(schema.users.email, 'normal@roleradar.com'));
  if (existing.length === 0) {
    const pwHash = await hashPassword('password123');
    await db.insert(schema.users).values({
      email: 'normal@roleradar.com',
      name: 'Normal User',
      password_hash: pwHash,
      email_verified: true,
      is_admin: false,
    });
    console.log('Created normal@roleradar.com');
  } else {
    console.log('Normal already exists');
  }
}

main().catch(console.error).finally(() => process.exit(0));
