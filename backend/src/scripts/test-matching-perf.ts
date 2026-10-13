import 'dotenv/config';
import '../config/env.js';
import { findMatchesForUser } from '../matching/matching-service.js';

async function main() {
  console.log('Testing findMatchesForUser...');
  try {
    const res = await findMatchesForUser('usr_1001_sde_fresher_active', { sort: 'BEST_MATCH' });
    console.log(`Found ${res.totalMatches} matches.`);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
main();
