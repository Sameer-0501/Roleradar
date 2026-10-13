import fs from 'fs';
import { SOURCE_CATALOG } from '../sources/catalog.js';

console.log('Current catalog count:', SOURCE_CATALOG.length);
const names = new Set(SOURCE_CATALOG.map(s => s.companyName.toLowerCase()));

const newEntries = [
  // GREENHOUSE
  {
    companyName: 'Sigmoid',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.sigmoid.com/careers/',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: { boardToken: 'sigmoid' },
  },
  {
    companyName: 'SingleStore',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.singlestore.com/careers/',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: { boardToken: 'singlestore' },
  },
  {
    companyName: 'Observe.AI',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.observe.ai/careers',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: { boardToken: 'observeai' },
  },
  {
    companyName: 'Karat',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://karat.com/careers/',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: { boardToken: 'karat' },
  },
  {
    companyName: 'Neo4j',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://neo4j.com/careers/',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: { boardToken: 'neo4j' },
  },
  {
    companyName: 'Cresta',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://cresta.com/careers/',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: { boardToken: 'cresta' },
  },
  {
    companyName: 'Yugabyte',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.yugabyte.com/careers/',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: { boardToken: 'yugabyte' },
  },

  // LEVER
  {
    companyName: 'Paytm',
    officialDomain: 'jobs.lever.co',
    careersUrl: 'https://paytm.com/careers',
    atsType: 'LEVER',
    isActive: true,
    scanIntervalMinutes: 30,
    config: { siteToken: 'paytm' },
  },
  {
    companyName: 'Fi Money',
    officialDomain: 'jobs.lever.co',
    careersUrl: 'https://fi.money/careers',
    atsType: 'LEVER',
    isActive: true,
    scanIntervalMinutes: 30,
    config: { siteToken: 'epifi' },
  },

  // ASHBY
  {
    companyName: 'Sarvam AI',
    officialDomain: 'jobs.ashbyhq.com',
    careersUrl: 'https://sarvam.ai/careers',
    atsType: 'ASHBY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: { jobBoardName: 'sarvam' },
  },
  {
    companyName: 'ElevenLabs',
    officialDomain: 'jobs.ashbyhq.com',
    careersUrl: 'https://elevenlabs.io/careers',
    atsType: 'ASHBY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: { jobBoardName: 'elevenlabs' },
  },

  // WORKDAY
  {
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
];

for (const entry of newEntries) {
  if (names.has(entry.companyName.toLowerCase())) {
    console.log(`Already in catalog: ${entry.companyName}`);
  } else {
    console.log(`Will add: ${entry.companyName} (${entry.atsType})`);
  }
}
