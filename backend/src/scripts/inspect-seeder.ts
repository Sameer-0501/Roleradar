import fs from 'fs';

const seeder = fs.readFileSync('src/sources/source-seeder.ts', 'utf-8');
console.log(seeder.substring(0, 1000));
