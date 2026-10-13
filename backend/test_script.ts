import { matchRole } from './src/matching/role-matcher.js';
import { parseSearchQuery } from './src/search/search-parser.js';

console.log("--- GET MATRIX ---");
const getQueries = [
  { t: "Graduate Engineer Trainee - Mechanical", exp: ["Mechanical Engineer"] },
  { t: "GET - Mechanical", exp: ["Mechanical Engineer"] },
  { t: "Graduate Engineer Trainee - Electrical", exp: ["Electrical Engineer"] },
  { t: "GET - Software", exp: ["Software Engineer"] },
];

for (const q of getQueries) {
  const match = matchRole(q.t, q.exp);
  console.log(`"${q.t}" -> ${match.matched ? match.matchType : 'NO_MATCH'}`);
}

console.log("\n--- SEARCH INTELLIGENCE MATRIX ---");
const searches = [
  "graduate engineer trainee mechanical",
  "get mechanical",
  "graduate engineer trainee electrical",
  "get civil",
  "graduate engineer trainee electronics",
  "graduate engineer trainee software",
  "get software",
  "graduate engineer trainee",
  "GET"
];

for (const s of searches) {
  const q = parseSearchQuery(s);
  console.log(`"${s}" -> Roles: ${q.roles.join(', ') || 'none'}, Category: ${q.occupationalCategory || 'none'}, Exp: ${q.experienceLevel || 'none'}`);
}
