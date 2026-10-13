import fs from 'fs';

const catalogPath = 'src/sources/catalog.ts';
let code = fs.readFileSync(catalogPath, 'utf-8');

const newGreenhouseEntries = `  {
    companyName: 'Sigmoid',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.sigmoid.com/careers/',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'sigmoid',
    },
  },
  {
    companyName: 'SingleStore',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.singlestore.com/careers/',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'singlestore',
    },
  },
  {
    companyName: 'Observe.AI',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.observe.ai/careers',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'observeai',
    },
  },
  {
    companyName: 'Karat',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://karat.com/careers/',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'karat',
    },
  },
  {
    companyName: 'Neo4j',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://neo4j.com/careers/',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'neo4j',
    },
  },
  {
    companyName: 'Cresta',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://cresta.com/careers/',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'cresta',
    },
  },
  {
    companyName: 'Yugabyte',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.yugabyte.com/careers/',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'yugabyte',
    },
  },
`;

const newLeverEntries = `  {
    companyName: 'Paytm',
    officialDomain: 'jobs.lever.co',
    careersUrl: 'https://paytm.com/careers',
    atsType: 'LEVER',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      siteToken: 'paytm',
    },
  },
  {
    companyName: 'Fi Money',
    officialDomain: 'jobs.lever.co',
    careersUrl: 'https://fi.money/careers',
    atsType: 'LEVER',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      siteToken: 'epifi',
    },
  },
`;

const newAshbyEntries = `  {
    companyName: 'Sarvam AI',
    officialDomain: 'jobs.ashbyhq.com',
    careersUrl: 'https://sarvam.ai/careers',
    atsType: 'ASHBY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      jobBoardName: 'sarvam',
    },
  },
  {
    companyName: 'ElevenLabs',
    officialDomain: 'jobs.ashbyhq.com',
    careersUrl: 'https://elevenlabs.io/careers',
    atsType: 'ASHBY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      jobBoardName: 'elevenlabs',
    },
  },
`;

const newWorkdayEntries = `  {
    companyName: 'Cisco',
    officialDomain: 'cisco.wd5.myworkdayjobs.com',
    careersUrl: 'https://cisco.wd5.myworkdayjobs.com/Cisco_Careers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 60,
    config: {
      host: 'cisco.wd5.myworkdayjobs.com',
      tenant: 'cisco',
      site: 'Cisco_Careers',
    },
  },
  {
    companyName: 'Target',
    officialDomain: 'target.wd5.myworkdayjobs.com',
    careersUrl: 'https://target.wd5.myworkdayjobs.com/targetcareers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 60,
    config: {
      host: 'target.wd5.myworkdayjobs.com',
      tenant: 'target',
      site: 'targetcareers',
    },
  },
  {
    companyName: 'CrowdStrike',
    officialDomain: 'crowdstrike.wd5.myworkdayjobs.com',
    careersUrl: 'https://crowdstrike.wd5.myworkdayjobs.com/crowdstrikecareers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 60,
    config: {
      host: 'crowdstrike.wd5.myworkdayjobs.com',
      tenant: 'crowdstrike',
      site: 'crowdstrikecareers',
    },
  },
`;

// Insert into respective sections
if (code.includes('// --- LEVER -----------------------------------------------------------------')) {
  code = code.replace(
    '// --- LEVER -----------------------------------------------------------------',
    newGreenhouseEntries + '  // --- LEVER -----------------------------------------------------------------'
  );
}

if (code.includes('// --- ASHBY -----------------------------------------------------------------')) {
  code = code.replace(
    '// --- ASHBY -----------------------------------------------------------------',
    newLeverEntries + '  // --- ASHBY -----------------------------------------------------------------'
  );
}

if (code.includes('// --- WORKDAY ---------------------------------------------------------------')) {
  code = code.replace(
    '// --- WORKDAY ---------------------------------------------------------------',
    newAshbyEntries + '  // --- WORKDAY ---------------------------------------------------------------'
  );
}

if (code.includes('// --- CUSTOM / EXPANDED -----------------------------------------------------')) {
  code = code.replace(
    '// --- CUSTOM / EXPANDED -----------------------------------------------------',
    newWorkdayEntries + '  // --- CUSTOM / EXPANDED -----------------------------------------------------'
  );
}

fs.writeFileSync(catalogPath, code, 'utf-8');
console.log('Successfully updated catalog.ts');
