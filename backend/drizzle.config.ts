import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://kcarrier:kcarrier_dev_password@localhost:5432/kcarrier_jobs',
  },
  verbose: true,
  strict: true,
});
