import fs from 'fs';

const content = fs.readFileSync('src/matching/experience-parser.ts', 'utf-8');
console.log(content);
