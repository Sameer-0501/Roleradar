import fs from 'fs';

const roleMatcherPath = 'src/matching/role-matcher.ts';
let code = fs.readFileSync(roleMatcherPath, 'utf-8');

const startIdx = code.indexOf("canonical: 'Software Engineer'");
console.log(code.substring(startIdx, startIdx + 1500));
