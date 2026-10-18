/**
 * Authoritative Source Catalog.
 *
 * Defines the initial list of verified employer ATS endpoints.
 * This file is the single source of truth for the default sources
 * seeded into PostgreSQL by source-seeder.ts.
 *
 * Requirements:
 * - Every source has an authoritative officialDomain (never an aggregator).
 * - Every source maps to a supported ATS type (GREENHOUSE, LEVER, WORKDAY, ASHBY, WORKABLE, or CUSTOM).
 * - Each source entry is complete and strongly typed.
 */
/**
 * Authoritative Source Catalog.
 *
 * Defines the initial list of verified employer ATS endpoints.
 * This file is the single source of truth for the default sources
 * seeded into PostgreSQL by source-seeder.ts.
 *
 * Requirements:
 * - Every source has an authoritative officialDomain (never an aggregator).
 * - Every source maps to a supported ATS type (GREENHOUSE, LEVER, WORKDAY, ASHBY, WORKABLE, or CUSTOM).
 * - Each source entry is complete and strongly typed.
 */

import type {
  GreenhouseSourceConfig,
  LeverSourceConfig,
  WorkdaySourceConfig,
  CustomSourceConfig,
  AshbySourceConfig,
  WorkableSourceConfig,
  SmartRecruitersSourceConfig,
  SapSourceConfig,
} from '../collectors/types.js';

export interface BaseSourceDefinition {
  companyName: string;
  officialDomain: string;
  careersUrl: string;
  isActive: boolean;
  scanIntervalMinutes: number;
}

export interface GreenhouseSourceDefinition extends BaseSourceDefinition {
  atsType: 'GREENHOUSE';
  config: GreenhouseSourceConfig;
}

export interface LeverSourceDefinition extends BaseSourceDefinition {
  atsType: 'LEVER';
  config: LeverSourceConfig;
}

export interface WorkdaySourceDefinition extends BaseSourceDefinition {
  atsType: 'WORKDAY';
  config: WorkdaySourceConfig;
}

export interface CustomSourceDefinition extends BaseSourceDefinition {
  atsType: 'CUSTOM';
  config: CustomSourceConfig;
}

export interface AshbySourceDefinition extends BaseSourceDefinition {
  atsType: 'ASHBY';
  config: AshbySourceConfig;
}

export interface WorkableSourceDefinition extends BaseSourceDefinition {
  atsType: 'WORKABLE';
  config: WorkableSourceConfig;
}

export interface SmartRecruitersSourceDefinition extends BaseSourceDefinition {
  atsType: 'SMARTRECRUITERS';
  config: SmartRecruitersSourceConfig;
}

export interface SapSourceDefinition extends BaseSourceDefinition {
  atsType: 'SAP';
  config: SapSourceConfig;
}

export type SourceDefinition =
  | GreenhouseSourceDefinition
  | LeverSourceDefinition
  | WorkdaySourceDefinition
  | CustomSourceDefinition
  | AshbySourceDefinition
  | WorkableSourceDefinition
  | SmartRecruitersSourceDefinition
  | SapSourceDefinition;

export const SOURCE_CATALOG: SourceDefinition[] = [
  // --- GREENHOUSE ------------------------------------------------------------
  {
    companyName: 'GitLab',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://about.gitlab.com/jobs/',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'gitlab',
    },
  },
  {
    companyName: 'Figma',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.figma.com/careers/',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'figma',
    },
  },
  {
    companyName: 'Stripe',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://stripe.com/jobs',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'stripe',
    },
  },
  {
    companyName: 'Cloudflare',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.cloudflare.com/careers/',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'cloudflare',
    },
  },
  {
    companyName: 'Reddit',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.redditinc.com/careers',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'reddit',
    },
  },
  {
    companyName: 'Discord',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://discord.com/careers',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'discord',
    },
  },
  {
    companyName: 'Pinterest',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.pinterestcareers.com/',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'pinterest',
    },
  },
  {
    companyName: 'GitHub',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://github.com/about/careers',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'github',
    },
  },
  {
    companyName: 'Datadog',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.datadoghq.com/careers/',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'datadog',
    },
  },
  {
    companyName: 'Automattic',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://automattic.com/work-with-us/',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'automattic',
    },
  },
  {
    companyName: 'Elastic',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.elastic.co/about/careers',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'elastic',
    },
  },
  {
    companyName: 'Docker',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.docker.com/careers/',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'docker',
    },
  },
  {
    companyName: 'Brex',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.brex.com/careers',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'brex',
    },
  },
  {
    companyName: 'Postman',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.postman.com/careers/',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'postman',
    },
  },
  {
    companyName: 'InMobi',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.inmobi.com/company/careers/',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'inmobi',
    },
  },
  {
    companyName: 'Groww',
    officialDomain: 'job-boards.eu.greenhouse.io',
    careersUrl: 'https://groww.in/careers',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'groww',
    },
  },
  {
    companyName: 'Anthropic',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.anthropic.com/careers',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'anthropic',
    },
  },
  {
    companyName: 'Scale AI',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://scale.com/careers',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'scaleai',
    },
  },
  {
    companyName: 'Razorpay',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://razorpay.com/jobs/',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'razorpaysoftwareprivatelimited',
    },
  },
  {
    companyName: 'HackerRank',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.hackerrank.com/careers',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'hackerrank',
    },
  },
  {
    companyName: 'Druva',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.druva.com/why-druva/explore/careers/',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'druva',
    },
  },
  {
    companyName: 'PubMatic',
    officialDomain: 'pubmatic.com',
    careersUrl: 'https://pubmatic.com/careers/',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'pubmatic',
    },
  },
  {
    companyName: 'Glance',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://glance.com/careers',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'glance',
    },
  },
  {
    companyName: 'MongoDB',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.mongodb.com/careers',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'mongodb',
    },
  },
  {
    companyName: 'Okta',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.okta.com/company/careers/',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'okta',
    },
  },
  {
    companyName: 'Twilio',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.twilio.com/en-us/company/jobs',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'twilio',
    },
  },
  {
    companyName: 'Rubrik',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.rubrik.com/company/careers',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'rubrik',
    },
  },
  {
    companyName: 'Samsara',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.samsara.com/company/careers',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'samsara',
    },
  },
  {
    companyName: 'Toast',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://pos.toasttab.com/careers',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'toast',
    },
  },
  {
    companyName: 'Roblox',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://careers.roblox.com/',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'roblox',
    },
  },

    {
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
  // --- LEVER -----------------------------------------------------------------
  {
    companyName: 'Palantir',
    officialDomain: 'jobs.lever.co',
    careersUrl: 'https://www.palantir.com/careers/',
    atsType: 'LEVER',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      siteToken: 'palantir',
    },
  },
  {
    companyName: 'Netflix',
    officialDomain: 'jobs.lever.co',
    careersUrl: 'https://jobs.netflix.com/',
    atsType: 'LEVER',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      siteToken: 'netflix',
    },
  },
  {
    companyName: 'Spotify',
    officialDomain: 'jobs.lever.co',
    careersUrl: 'https://www.lifeatspotify.com/jobs',
    atsType: 'LEVER',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      siteToken: 'spotify',
    },
  },
  {
    companyName: 'Twitch',
    officialDomain: 'jobs.lever.co',
    careersUrl: 'https://www.twitch.tv/jobs/',
    atsType: 'LEVER',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      siteToken: 'twitch',
    },
  },
  {
    companyName: 'CRED',
    officialDomain: 'jobs.lever.co',
    careersUrl: 'https://cred.club/careers',
    atsType: 'LEVER',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      siteToken: 'cred',
    },
  },
  {
    companyName: 'Affirm',
    officialDomain: 'jobs.lever.co',
    careersUrl: 'https://www.affirm.com/careers',
    atsType: 'LEVER',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      siteToken: 'affirm',
    },
  },
  {
    companyName: 'Atlassian',
    officialDomain: 'jobs.lever.co',
    careersUrl: 'https://www.atlassian.com/company/careers',
    atsType: 'LEVER',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      siteToken: 'atlassian',
    },
  },
  {
    companyName: 'Meesho',
    officialDomain: 'jobs.lever.co',
    careersUrl: 'https://www.meesho.io/jobs',
    atsType: 'LEVER',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      siteToken: 'meesho',
    },
  },
  {
    companyName: 'Mindtickle',
    officialDomain: 'jobs.lever.co',
    careersUrl: 'https://www.mindtickle.com/careers/',
    atsType: 'LEVER',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      siteToken: 'mindtickle',
    },
  },
  {
    companyName: 'HighLevel',
    officialDomain: 'jobs.lever.co',
    careersUrl: 'https://www.gohighlevel.com/careers',
    atsType: 'LEVER',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      siteToken: 'gohighlevel',
    },
  },
  {
    companyName: 'Zeta',
    officialDomain: 'jobs.lever.co',
    careersUrl: 'https://www.zeta.tech/careers',
    atsType: 'LEVER',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      siteToken: 'zeta',
    },
  },

    {
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
  {
    companyName: 'Ubisoft',
    officialDomain: 'jobs.smartrecruiters.com',
    careersUrl: 'https://www.ubisoft.com/en-us/company/careers',
    atsType: 'SMARTRECRUITERS',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      companyName: 'Ubisoft',
      companyIdentifier: 'ubisoft',
    },
  },
  {
    companyName: 'Avery Dennison',
    officialDomain: 'jobs.smartrecruiters.com',
    careersUrl: 'https://www.averydennison.com/en/home/about-us/careers.html',
    atsType: 'SMARTRECRUITERS',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      companyName: 'Avery Dennison',
      companyIdentifier: 'averydennison',
    },
  },
  {
    companyName: 'Visa',
    officialDomain: 'jobs.smartrecruiters.com',
    careersUrl: 'https://www.visa.com.au/en_AU/jobs/',
    atsType: 'SMARTRECRUITERS',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      companyName: 'Visa',
      companyIdentifier: 'visa',
    },
  },
  {
    companyName: 'Experian',
    officialDomain: 'jobs.smartrecruiters.com',
    careersUrl: 'https://www.experian.com/careers/',
    atsType: 'SMARTRECRUITERS',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      companyName: 'Experian',
      companyIdentifier: 'experian',
    },
  },
  {
    companyName: 'ServiceNow',
    officialDomain: 'jobs.smartrecruiters.com',
    careersUrl: 'https://careers.servicenow.com/',
    atsType: 'SMARTRECRUITERS',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      companyName: 'ServiceNow',
      companyIdentifier: 'servicenow',
    },
  },
  {
    companyName: 'PhonePe',
    officialDomain: 'jobs.smartrecruiters.com',
    careersUrl: 'https://www.phonepe.com/careers/',
    atsType: 'SMARTRECRUITERS',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      companyName: 'PhonePe',
      companyIdentifier: 'PHONEPELIMITED',
    },
  },
  {
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
  // --- ASHBY -----------------------------------------------------------------
  {
    companyName: 'Linear',
    officialDomain: 'jobs.ashbyhq.com',
    careersUrl: 'https://linear.app/careers',
    atsType: 'ASHBY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      jobBoardName: 'linear',
    },
  },
  {
    companyName: 'Retool',
    officialDomain: 'jobs.ashbyhq.com',
    careersUrl: 'https://retool.com/careers',
    atsType: 'ASHBY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      jobBoardName: 'retool',
    },
  },
  {
    companyName: 'OpenAI',
    officialDomain: 'jobs.ashbyhq.com',
    careersUrl: 'https://openai.com/careers',
    atsType: 'ASHBY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      jobBoardName: 'openai',
    },
  },
  {
    companyName: 'Ramp',
    officialDomain: 'jobs.ashbyhq.com',
    careersUrl: 'https://ramp.com/careers',
    atsType: 'ASHBY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      jobBoardName: 'ramp',
    },
  },
  {
    companyName: 'Notion',
    officialDomain: 'jobs.ashbyhq.com',
    careersUrl: 'https://www.notion.so/careers',
    atsType: 'ASHBY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      jobBoardName: 'notion',
    },
  },
  {
    companyName: 'Supabase',
    officialDomain: 'jobs.ashbyhq.com',
    careersUrl: 'https://supabase.com/careers',
    atsType: 'ASHBY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      jobBoardName: 'supabase',
    },
  },
  {
    companyName: 'Perplexity',
    officialDomain: 'jobs.ashbyhq.com',
    careersUrl: 'https://www.perplexity.ai/careers',
    atsType: 'ASHBY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      jobBoardName: 'perplexity',
    },
  },
  {
    companyName: 'Replit',
    officialDomain: 'jobs.ashbyhq.com',
    careersUrl: 'https://replit.com/careers',
    atsType: 'ASHBY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      jobBoardName: 'replit',
    },
  },
  {
    companyName: 'Cohere',
    officialDomain: 'jobs.ashbyhq.com',
    careersUrl: 'https://cohere.com/careers',
    atsType: 'ASHBY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      jobBoardName: 'cohere',
    },
  },
  {
    companyName: 'Atlan',
    officialDomain: 'jobs.ashbyhq.com',
    careersUrl: 'https://atlan.com/careers/',
    atsType: 'ASHBY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      jobBoardName: 'atlan',
    },
  },
  {
    companyName: 'DevRev',
    officialDomain: 'jobs.ashbyhq.com',
    careersUrl: 'https://devrev.ai/careers',
    atsType: 'ASHBY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      jobBoardName: 'devrev',
    },
  },
  {
    companyName: 'Sprinto',
    officialDomain: 'jobs.ashbyhq.com',
    careersUrl: 'https://sprinto.com/careers/',
    atsType: 'ASHBY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      jobBoardName: 'sprinto',
    },
  },
  {
    companyName: 'DhiWise',
    officialDomain: 'jobs.ashbyhq.com',
    careersUrl: 'https://www.dhiwise.com/careers',
    atsType: 'ASHBY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      jobBoardName: 'dhiwise',
    },
  },

  // --- WORKABLE --------------------------------------------------------------
  {
    companyName: 'BrowserStack',
    officialDomain: 'apply.workable.com',
    careersUrl: 'https://www.browserstack.com/careers',
    atsType: 'WORKABLE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      accountSlug: 'browserstack',
    },
  },
  // --- PHASE 8.2 INTERNATIONAL EXPANSION (UK, DE, NL, IE, AU, CA, US) -------
  {
    companyName: 'Deliveroo',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://careers.deliveroo.co.uk',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'deliveroo',
    },
  },
  {
    companyName: 'Monzo',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://monzo.com/careers',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'monzo',
    },
  },
  {
    companyName: 'Celonis',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.celonis.com/careers',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'celonis',
    },
  },
  {
    companyName: 'DeepL',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.deepl.com/careers',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'deepl',
    },
  },
  {
    companyName: 'Adyen',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://careers.adyen.com',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'adyen',
    },
  },
  {
    companyName: 'Canva',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.canva.com/careers',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'canva',
    },
  },
  {
    companyName: 'Intercom',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://www.intercom.com/careers',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'intercom',
    },
  },
  {
    companyName: 'Sentry',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://sentry.io/careers',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'sentry',
    },
  },
  {
    companyName: 'Temporal',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://temporal.io/careers',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'temporal',
    },
  },
  {
    companyName: 'Weights & Biases',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://wandb.ai/careers',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'wandb',
    },
  },
  {
    companyName: 'Sourcegraph',
    officialDomain: 'job-boards.greenhouse.io',
    careersUrl: 'https://about.sourcegraph.com/careers',
    atsType: 'GREENHOUSE',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      boardToken: 'sourcegraph',
    },
  },
  {
    companyName: '1Password',
    officialDomain: 'jobs.lever.co',
    careersUrl: 'https://1password.com/careers',
    atsType: 'LEVER',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      siteToken: '1password',
    },
  },
  {
    companyName: 'Vercel',
    officialDomain: 'jobs.ashbyhq.com',
    careersUrl: 'https://vercel.com/careers',
    atsType: 'ASHBY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      jobBoardName: 'vercel',
    },
  },
  {
    companyName: 'Accenture',
    officialDomain: 'accenture.wd103.myworkdayjobs.com',
    careersUrl: 'https://accenture.wd103.myworkdayjobs.com/AccentureCareers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'accenture.wd103.myworkdayjobs.com',
      tenant: 'accenture',
      clientSite: 'AccentureCareers',
    },
  },
  {
    companyName: 'HPE',
    officialDomain: 'hpe.wd5.myworkdayjobs.com',
    careersUrl: 'https://hpe.wd5.myworkdayjobs.com/Jobsathpe',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'hpe.wd5.myworkdayjobs.com',
      tenant: 'hpe',
      clientSite: 'Jobsathpe',
    },
  },
  {
    companyName: 'JLL',
    officialDomain: 'jll.wd1.myworkdayjobs.com',
    careersUrl: 'https://jll.wd1.myworkdayjobs.com/jllcareers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'jll.wd1.myworkdayjobs.com',
      tenant: 'jll',
      clientSite: 'jllcareers',
    },
  },
  {
    companyName: 'Bosch India',
    officialDomain: 'jobs.smartrecruiters.com',
    careersUrl: 'https://careers.smartrecruiters.com/BoschGroup/',
    atsType: 'SMARTRECRUITERS',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      companyIdentifier: 'BoschGroup',
    },
  },
  {
    companyName: 'Hevo Data',
    officialDomain: 'jobs.lever.co',
    careersUrl: 'https://jobs.lever.co/hevodata',
    atsType: 'LEVER',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      siteToken: 'hevodata',
    },
  },
  {
    companyName: 'Citi',
    officialDomain: 'citi.wd5.myworkdayjobs.com',
    careersUrl: 'https://citi.wd5.myworkdayjobs.com/2',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'citi.wd5.myworkdayjobs.com',
      tenant: 'citi',
      clientSite: '2',
    },
  },
  {
    companyName: 'GE Aerospace',
    officialDomain: 'geaerospace.wd5.myworkdayjobs.com',
    careersUrl: 'https://geaerospace.wd5.myworkdayjobs.com/GE_ExternalSite',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'geaerospace.wd5.myworkdayjobs.com',
      tenant: 'geaerospace',
      clientSite: 'GE_ExternalSite',
    },
  },
  {
    companyName: 'GE Vernova',
    officialDomain: 'gevernova.wd5.myworkdayjobs.com',
    careersUrl: 'https://gevernova.wd5.myworkdayjobs.com/Vernova_ExternalSite',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'gevernova.wd5.myworkdayjobs.com',
      tenant: 'gevernova',
      clientSite: 'Vernova_ExternalSite',
    },
  },
  {
    companyName: 'GE HealthCare',
    officialDomain: 'gehc.wd5.myworkdayjobs.com',
    careersUrl: 'https://gehc.wd5.myworkdayjobs.com/GEHC_ExternalSite',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'gehc.wd5.myworkdayjobs.com',
      tenant: 'gehc',
      clientSite: 'GEHC_ExternalSite',
    },
  },
  {
    companyName: 'Autodesk',
    officialDomain: 'autodesk.wd1.myworkdayjobs.com',
    careersUrl: 'https://autodesk.wd1.myworkdayjobs.com/Ext',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'autodesk.wd1.myworkdayjobs.com',
      tenant: 'autodesk',
      clientSite: 'Ext',
    },
  },
  {
    companyName: 'CERN',
    officialDomain: 'jobs.smartrecruiters.com',
    careersUrl: 'https://careers.cern/',
    atsType: 'CUSTOM',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      companyName: 'CERN',
      officialDomain: 'jobs.smartrecruiters.com',
      careersUrl: 'https://careers.cern/',
      apiEndpoint: 'https://api.smartrecruiters.com/v1/companies/cern/postings',
      perJobApiEndpointTemplate: 'https://api.smartrecruiters.com/v1/companies/cern/postings/{id}',
      paginationConfig: {
        strategy: 'offset_limit',
        pageSize: 20,
        maxPages: 1,
      },
      fieldMappings: {
        jobsPath: 'content',
        idField: 'id',
        titleField: 'name',
        cityField: 'location.city',
        countryField: 'location.country',
        urlTemplate: 'https://jobs.smartrecruiters.com/cern/{id}',
        applyUrlField: 'applyUrl',
        postedAtField: 'releasedDate',
      },
      timeoutMs: 30_000,
    },
  },
  // --- SAP SUCCESSFACTORS ----------------------------------------------------
  {
    companyName: 'Wipro',
    officialDomain: 'careers.wipro.com',
    careersUrl: 'https://careers.wipro.com/',
    atsType: 'SAP',
    isActive: true,
    scanIntervalMinutes: 60,
    config: {
      apiBaseUrl: 'https://careers.wipro.com',
    },
  },
  {
    companyName: 'HCLTech',
    officialDomain: 'careers.hcltech.com',
    careersUrl: 'https://careers.hcltech.com',
    atsType: 'SAP',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      apiBaseUrl: 'https://careers.hcltech.com',
    },
  },
  {
    companyName: 'Swiggy',
    officialDomain: 'jobs.smartrecruiters.com',
    careersUrl: 'https://careers.swiggy.com/',
    atsType: 'SMARTRECRUITERS',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      companyIdentifier: 'SWIGGY',
    },
  },
  // --- WORKDAY NEW ADDITIONS -------------------------------------------------
  {
    companyName: 'PwC',
    officialDomain: 'pwc.wd3.myworkdayjobs.com',
    careersUrl: 'https://pwc.wd3.myworkdayjobs.com/Global_Experienced_Careers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'pwc.wd3.myworkdayjobs.com',
      tenant: 'pwc',
      clientSite: 'Global_Experienced_Careers',
    },
  },
  {
    companyName: 'Morgan Stanley',
    officialDomain: 'ms.wd5.myworkdayjobs.com',
    careersUrl: 'https://ms.wd5.myworkdayjobs.com/External',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'ms.wd5.myworkdayjobs.com',
      tenant: 'ms',
      clientSite: 'External',
    },
  },
  {
    companyName: 'Bank of America',
    officialDomain: 'ghr.wd1.myworkdayjobs.com',
    careersUrl: 'https://ghr.wd1.myworkdayjobs.com/lateral-us',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'ghr.wd1.myworkdayjobs.com',
      tenant: 'ghr',
      clientSite: 'lateral-us',
    },
  },
  {
    companyName: 'Adobe',
    officialDomain: 'adobe.wd5.myworkdayjobs.com',
    careersUrl: 'https://www.adobe.com/careers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'adobe.wd5.myworkdayjobs.com',
      tenant: 'adobe',
      clientSite: 'external_experienced',
    },
  },
  {
    companyName: 'Target',
    officialDomain: 'target.wd5.myworkdayjobs.com',
    careersUrl: 'https://corporate.target.com/careers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'target.wd5.myworkdayjobs.com',
      tenant: 'target',
      clientSite: 'targetcareers',
    },
  },
  {
    companyName: 'Cisco',
    officialDomain: 'cisco.wd5.myworkdayjobs.com',
    careersUrl: 'https://jobs.cisco.com',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'cisco.wd5.myworkdayjobs.com',
      tenant: 'cisco',
      clientSite: 'Cisco_Careers',
    },
  },
  {
    companyName: 'Mastercard',
    officialDomain: 'mastercard.wd1.myworkdayjobs.com',
    careersUrl: 'https://www.mastercard.com/careers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'mastercard.wd1.myworkdayjobs.com',
      tenant: 'mastercard',
      clientSite: 'CorporateCareers',
    },
  },
  {
    companyName: 'Cadence Design Systems',
    officialDomain: 'cadence.wd1.myworkdayjobs.com',
    careersUrl: 'https://www.cadence.com/en_US/home/company/careers.html',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'cadence.wd1.myworkdayjobs.com',
      tenant: 'cadence',
      clientSite: 'External_Careers',
    },
  },
  {
    companyName: 'Applied Materials',
    officialDomain: 'amat.wd1.myworkdayjobs.com',
    careersUrl: 'https://careers.appliedmaterials.com',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'amat.wd1.myworkdayjobs.com',
      tenant: 'amat',
      clientSite: 'External',
    },
  },
  {
    companyName: 'NXP Semiconductors',
    officialDomain: 'nxp.wd3.myworkdayjobs.com',
    careersUrl: 'https://www.nxp.com/company/about-nxp/careers:CAREERS',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'nxp.wd3.myworkdayjobs.com',
      tenant: 'nxp',
      clientSite: 'careers',
    },
  },
  {
    companyName: 'Medtronic',
    officialDomain: 'medtronic.wd1.myworkdayjobs.com',
    careersUrl: 'https://www.medtronic.com/us-en/about/careers.html',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'medtronic.wd1.myworkdayjobs.com',
      tenant: 'medtronic',
      clientSite: 'MedtronicCareers',
    },
  },
  {
    companyName: 'CrowdStrike',
    officialDomain: 'crowdstrike.wd5.myworkdayjobs.com',
    careersUrl: 'https://www.crowdstrike.com/careers/',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'crowdstrike.wd5.myworkdayjobs.com',
      tenant: 'crowdstrike',
      clientSite: 'crowdstrikecareers',
    },
  },
  {
    companyName: 'Western Digital',
    officialDomain: 'jobs.smartrecruiters.com',
    careersUrl: 'https://www.westerndigital.com/company/careers',
    atsType: 'SMARTRECRUITERS',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      companyIdentifier: 'WesternDigital',
    },
  },
  {
    companyName: 'Micron Technology',
    officialDomain: 'micron.wd1.myworkdayjobs.com',
    careersUrl: 'https://www.micron.com/about/careers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'micron.wd1.myworkdayjobs.com',
      tenant: 'micron',
      clientSite: 'External',
    },
  },
  {
    companyName: 'Nvidia',
    officialDomain: 'nvidia.wd5.myworkdayjobs.com',
    careersUrl: 'https://www.nvidia.com/en-us/about-nvidia/careers/',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'nvidia.wd5.myworkdayjobs.com',
      tenant: 'nvidia',
      clientSite: 'NVIDIAExternalCareerSite',
    },
  },
  {
    companyName: 'Airbus',
    officialDomain: 'ag.wd3.myworkdayjobs.com',
    careersUrl: 'https://www.airbus.com/en/careers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'ag.wd3.myworkdayjobs.com',
      tenant: 'ag',
      clientSite: 'Airbus',
      appliedFacets: {
        locationCountry: ['c4f78be1a8f14da0ab49ce1162348a5e'],
      },
    },
  },
  {
    companyName: 'State Street',
    officialDomain: 'statestreet.wd1.myworkdayjobs.com',
    careersUrl: 'https://careers.statestreet.com',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'statestreet.wd1.myworkdayjobs.com',
      tenant: 'statestreet',
      clientSite: 'global',
      appliedFacets: {
        Location_Country: ['c4f78be1a8f14da0ab49ce1162348a5e'],
      },
    },
  },
  {
    companyName: 'Cushman & Wakefield',
    officialDomain: 'cw.wd1.myworkdayjobs.com',
    careersUrl: 'https://cushmanwakefield.com/careers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'cw.wd1.myworkdayjobs.com',
      tenant: 'cw',
      clientSite: 'External',
      appliedFacets: {
        Location_Country: ['c4f78be1a8f14da0ab49ce1162348a5e'],
      },
    },
  },
  {
    companyName: 'LSEG',
    officialDomain: 'lseg.wd3.myworkdayjobs.com',
    careersUrl: 'https://lseg.com/careers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'lseg.wd3.myworkdayjobs.com',
      tenant: 'lseg',
      clientSite: 'Careers',
      appliedFacets: {
        locationCountry: ['c4f78be1a8f14da0ab49ce1162348a5e'],
      },
    },
  },
  {
    companyName: 'Stryker',
    officialDomain: 'stryker.wd1.myworkdayjobs.com',
    careersUrl: 'https://careers.stryker.com',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'stryker.wd1.myworkdayjobs.com',
      tenant: 'stryker',
      clientSite: 'StrykerCareers',
      appliedFacets: {
        Location_Country: ['c4f78be1a8f14da0ab49ce1162348a5e'],
      },
    },
  },
  {
    companyName: 'KONE',
    officialDomain: 'kone.wd3.myworkdayjobs.com',
    careersUrl: 'https://kone.com/careers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'kone.wd3.myworkdayjobs.com',
      tenant: 'kone',
      clientSite: 'Careers',
      appliedFacets: {
        Country: ['c4f78be1a8f14da0ab49ce1162348a5e'],
      },
    },
  },
  {
    companyName: 'Aptiv',
    officialDomain: 'aptiv.wd5.myworkdayjobs.com',
    careersUrl: 'https://aptiv.com/careers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'aptiv.wd5.myworkdayjobs.com',
      tenant: 'aptiv',
      clientSite: 'APTIV_CAREERS',
      appliedFacets: {
        Country: ['c4f78be1a8f14da0ab49ce1162348a5e'],
      },
    },
  },
  {
    companyName: 'Fractal Analytics',
    officialDomain: 'fractal.wd1.myworkdayjobs.com',
    careersUrl: 'https://fractal.ai/careers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'fractal.wd1.myworkdayjobs.com',
      tenant: 'fractal',
      clientSite: 'Careers',
    },
  },
  {
    companyName: 'Piramal Pharma',
    officialDomain: 'piramalpharma.wd102.myworkdayjobs.com',
    careersUrl: 'https://piramal.com/careers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'piramalpharma.wd102.myworkdayjobs.com',
      tenant: 'piramalpharma',
      clientSite: 'PIRAMAL_EXTERNAL_CAREERS',
    },
  },
  {
    companyName: 'Elevance Health',
    officialDomain: 'elevancehealth.wd1.myworkdayjobs.com',
    careersUrl: 'https://careers.elevancehealth.com',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'elevancehealth.wd1.myworkdayjobs.com',
      tenant: 'elevancehealth',
      clientSite: 'carelonglobal_in',
    },
  },
  {
    companyName: 'Thomson Reuters',
    officialDomain: 'thomsonreuters.wd5.myworkdayjobs.com',
    careersUrl: 'https://www.thomsonreuters.com/en/careers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'thomsonreuters.wd5.myworkdayjobs.com',
      tenant: 'thomsonreuters',
      clientSite: 'external_career_site',
      appliedFacets: {
        Location_Country: ['c4f78be1a8f14da0ab49ce1162348a5e'],
      },
    },
  },
  {
    companyName: 'Danaher Corporation',
    officialDomain: 'danaher.wd1.myworkdayjobs.com',
    careersUrl: 'https://jobs.danaher.com',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'danaher.wd1.myworkdayjobs.com',
      tenant: 'danaher',
      clientSite: 'DanaherJobs',
      appliedFacets: {
        locationCountry: ['c4f78be1a8f14da0ab49ce1162348a5e'],
      },
    },
  },
  {
    companyName: 'Nationwide',
    officialDomain: 'nationwide.wd1.myworkdayjobs.com',
    careersUrl: 'https://nationwide.com/careers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'nationwide.wd1.myworkdayjobs.com',
      tenant: 'nationwide',
      clientSite: 'Nationwide_Career_India',
    },
  },
  {
    companyName: 'AML RightSource',
    officialDomain: 'amlrightsource.wd1.myworkdayjobs.com',
    careersUrl: 'https://amlrightsource.com/careers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'amlrightsource.wd1.myworkdayjobs.com',
      tenant: 'amlrightsource',
      clientSite: 'amlrightsource',
      appliedFacets: {
        locationCountry: ['c4f78be1a8f14da0ab49ce1162348a5e'],
      },
    },
  },
  {
    companyName: 'Dentsu Aegis',
    officialDomain: 'dentsuaegis.wd3.myworkdayjobs.com',
    careersUrl: 'https://dentsu.com/careers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'dentsuaegis.wd3.myworkdayjobs.com',
      tenant: 'dentsuaegis',
      clientSite: 'DAN_GLOBAL',
      appliedFacets: {
        locationCountry: ['c4f78be1a8f14da0ab49ce1162348a5e'],
      },
    },
  },
  {
    companyName: 'Ares Management',
    officialDomain: 'aresmgmt.wd1.myworkdayjobs.com',
    careersUrl: 'https://aresmgmt.com/careers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'aresmgmt.wd1.myworkdayjobs.com',
      tenant: 'aresmgmt',
      clientSite: 'External',
      appliedFacets: {
        locations: ['a2362609c819012953474b7fbb237e80'],
      },
    },
  },
  {
    companyName: 'GlobalFoundries',
    officialDomain: 'globalfoundries.wd1.myworkdayjobs.com',
    careersUrl: 'https://gf.com/careers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'globalfoundries.wd1.myworkdayjobs.com',
      tenant: 'globalfoundries',
      clientSite: 'External',
      appliedFacets: {
        locationCountry: ['c4f78be1a8f14da0ab49ce1162348a5e'],
      },
    },
  },
  {
    companyName: 'Philips',
    officialDomain: 'philips.wd3.myworkdayjobs.com',
    careersUrl: 'https://www.careers.philips.com/global/en',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'philips.wd3.myworkdayjobs.com',
      tenant: 'philips',
      clientSite: 'jobs-and-careers',
      appliedFacets: {
        locationHierarchy1: ['6e1b2a934716103c2adde1d57e7700ea'],
      },
    },
  },
  {
    companyName: 'PUMA',
    officialDomain: 'puma.wd502.myworkdayjobs.com',
    careersUrl: 'https://about.puma.com/en/careers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'puma.wd502.myworkdayjobs.com',
      tenant: 'puma',
      clientSite: 'Jobs_at_Puma',
      appliedFacets: {
        Location_Country: ['c4f78be1a8f14da0ab49ce1162348a5e'],
      },
    },
  },
  {
    companyName: 'Opella',
    officialDomain: 'opella.wd103.myworkdayjobs.com',
    careersUrl: 'https://www.opella.com/en/careers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'opella.wd103.myworkdayjobs.com',
      tenant: 'opella',
      clientSite: 'OpellaCareers',
      appliedFacets: {
        locationCountry: ['c4f78be1a8f14da0ab49ce1162348a5e'],
      },
    },
  },
  {
    companyName: 'Regal Rexnord',
    officialDomain: 'regalrexnord.wd1.myworkdayjobs.com',
    careersUrl: 'https://careers.regalrexnord.com',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'regalrexnord.wd1.myworkdayjobs.com',
      tenant: 'regalrexnord',
      clientSite: 'Careers',
      appliedFacets: {
        locationCountry: ['c4f78be1a8f14da0ab49ce1162348a5e'],
      },
    },
  },
  {
    companyName: 'Genpact',
    officialDomain: 'genpact.wd108.myworkdayjobs.com',
    careersUrl: 'https://careers.genpact.com',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'genpact.wd108.myworkdayjobs.com',
      tenant: 'genpact',
      clientSite: 'external_careers',
    },
  },
  {
    companyName: 'Abbott',
    officialDomain: 'abbott.wd5.myworkdayjobs.com',
    careersUrl: 'https://jobs.abbott',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'abbott.wd5.myworkdayjobs.com',
      tenant: 'abbott',
      clientSite: 'abbottcareers',
      appliedFacets: {
        Location_Country: ['c4f78be1a8f14da0ab49ce1162348a5e'],
      },
    },
  },
  {
    companyName: 'General Mills',
    officialDomain: 'genmills.wd1.myworkdayjobs.com',
    careersUrl: 'https://careers.generalmills.com',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'genmills.wd1.myworkdayjobs.com',
      tenant: 'genmills',
      clientSite: 'GMI_External_Careers',
      appliedFacets: {
        locationCountry: ['c4f78be1a8f14da0ab49ce1162348a5e'],
      },
    },
  },
  {
    companyName: 'Cigna Healthcare',
    officialDomain: 'cigna.wd5.myworkdayjobs.com',
    careersUrl: 'https://jobs.cigna.com',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'cigna.wd5.myworkdayjobs.com',
      tenant: 'cigna',
      clientSite: 'cignacareers',
      appliedFacets: {
        Location_Country: ['c4f78be1a8f14da0ab49ce1162348a5e'],
      },
    },
  },
  {
    companyName: 'RELX',
    officialDomain: 'relx.wd3.myworkdayjobs.com',
    careersUrl: 'https://relx.com/careers',
    atsType: 'WORKDAY',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      host: 'relx.wd3.myworkdayjobs.com',
      tenant: 'relx',
      clientSite: 'relx',
      appliedFacets: {
        Country___Territory: ['c4f78be1a8f14da0ab49ce1162348a5e'],
      },
    },
  },
];



