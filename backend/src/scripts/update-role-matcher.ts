import fs from 'fs';

const roleMatcherPath = 'src/matching/role-matcher.ts';
let code = fs.readFileSync(roleMatcherPath, 'utf-8');

const oldBlock = `    synonyms: [
      'software development engineer',
      'software developer',
      'sde',
      'sde 1',
      'sde 2',
      'sde 3',
      'sde-i',
      'sde-ii',
      'sde-iii',
      'sde i',
      'sde ii',
      'sde iii',
      'member of technical staff',
      'mts',
      'mts 1',
      'mts i',
      'mts-1',
      'mts-i',
      'computer scientist',
      'computer scientist 1',
      'computer scientist i',
      'software eng',
      'applications developer',
      'software programmer',
    ],`;

const newBlock = `    synonyms: [
      'software development engineer',
      'software developer',
      'sde',
      'sde 1',
      'sde 2',
      'sde 3',
      'sde-i',
      'sde-ii',
      'sde-iii',
      'sde i',
      'sde ii',
      'sde iii',
      'member of technical staff',
      'mts',
      'mts 1',
      'mts i',
      'mts-1',
      'mts-i',
      'computer scientist',
      'computer scientist 1',
      'computer scientist i',
      'software eng',
      'applications developer',
      'application developer',
      'software programmer',
      'graduate engineer trainee',
      'graduate engineer',
      'get',
      'associate developer',
      'associate software developer',
      'associate engineer',
      'associate application developer',
      'graduate developer',
      'graduate software engineer',
      'junior developer',
      'junior software developer',
      'entry level developer',
      'entry level software developer',
      'software engineer 1',
      'software engineer i',
      'software engineer-1',
      'software engineer-i',
    ],`;

if (code.includes(oldBlock)) {
  code = code.replace(oldBlock, newBlock);
  fs.writeFileSync(roleMatcherPath, code, 'utf-8');
  console.log('Successfully updated role-matcher.ts');
} else {
  console.error('Could not find oldBlock in role-matcher.ts');
}
