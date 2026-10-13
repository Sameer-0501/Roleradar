import 'dotenv/config';
import { getDb } from './src/database/connection.js';
import { schema } from './src/database/index.js';
import { eq } from 'drizzle-orm';
import { hashPassword } from './src/auth/password.js';

async function main() {
  const db = getDb();
  
  const existing = await db.select().from(schema.users).where(eq(schema.users.email, 'admin@roleradar.com'));
  if (existing.length === 0) {
    const pwHash = await hashPassword('password123');
    await db.insert(schema.users).values({
      email: 'admin@roleradar.com',
      name: 'Super Admin',
      password_hash: pwHash,
      email_verified: true,
      is_admin: true,
    });
    console.log('Created admin@roleradar.com');
  } else {
    await db.update(schema.users).set({ is_admin: true }).where(eq(schema.users.email, 'admin@roleradar.com'));
    console.log('Admin already exists');
  }
}

main().catch(console.error).finally(() => process.exit(0));
