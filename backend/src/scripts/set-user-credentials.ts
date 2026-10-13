import pg from 'pg';
import { hashPassword } from '../auth/password.js';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://kcarrier:kcarrier_dev_password@localhost:5433/kcarrier_jobs',
  });
  await client.connect();

  const email = 'b10854752@gmail.com';
  const password = 'Password123!';
  const hash = await hashPassword(password);

  const res = await client.query('SELECT id, email, name, email_verified FROM users WHERE email = $1', [email]);
  if (res.rows.length > 0) {
    await client.query(
      'UPDATE users SET password_hash = $1, email_verified = true, email_verified_at = NOW() WHERE email = $2',
      [hash, email]
    );
    console.log('SUCCESS: Updated existing user password.');
  } else {
    const userRes = await client.query(
      'INSERT INTO users (email, name, password_hash, email_verified, email_verified_at) VALUES ($1, $2, $3, true, NOW()) RETURNING id',
      [email, 'Sameer', hash]
    );
    const userId = userRes.rows[0].id;
    await client.query(
      `INSERT INTO user_preferences (user_id, experience_level, onboarding_completed, roles, locations, workplace_types, email_alerts_enabled, instant_notifications)
       VALUES ($1, 'FRESHER', true, '["Software Engineer", "Frontend Developer", "Backend Developer", "Full Stack Developer"]'::jsonb, '["Bangalore", "Hyderabad", "Pune", "Remote"]'::jsonb, '["ONSITE", "HYBRID", "REMOTE"]'::jsonb, true, true)`,
      [userId]
    );
    console.log('SUCCESS: Created user with preferences.');
  }

  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
