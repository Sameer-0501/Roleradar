/**
 * Country Normalization & Location Geography Taxonomy.
 *
 * Provides structured mapping of canonical countries, ISO codes, aliases,
 * major global tech cities, and country-aware remote scope detection.
 */

export interface CountryDefinition {
  canonical: string;
  iso2: string;
  iso3: string;
  aliases: string[];
  majorCities: string[];
}

export const COUNTRY_TAXONOMY: CountryDefinition[] = [
  {
    canonical: 'India',
    iso2: 'IN',
    iso3: 'IND',
    aliases: ['india', 'bharat', 'in', 'ind'],
    majorCities: [
      'bangalore',
      'bengaluru',
      'hyderabad',
      'pune',
      'chennai',
      'mumbai',
      'delhi',
      'new delhi',
      'noida',
      'gurgaon',
      'gurugram',
      'kolkata',
      'ahmedabad',
      'kochi',
      'coimbatore',
      'trivandrum',
      'thiruvananthapuram',
      'jaipur',
      'indore',
      'chandigarh',
    ],
  },
  {
    canonical: 'United States',
    iso2: 'US',
    iso3: 'USA',
    aliases: [
      'united states',
      'united states of america',
      'usa',
      'us',
      'u.s.',
      'u.s',
      'u.s.a.',
      'america',
    ],
    majorCities: [
      'new york',
      'nyc',
      'san francisco',
      'sf',
      'bay area',
      'seattle',
      'austin',
      'boston',
      'chicago',
      'los angeles',
      'la',
      'denver',
      'boulder',
      'atlanta',
      'san jose',
      'sunnyvale',
      'mountain view',
      'palo alto',
      'redwood city',
      'menlo park',
      'cambridge',
      'san diego',
      'dallas',
      'houston',
      'portland',
      'washington dc',
      'washington d.c.',
      'raleigh',
      'durham',
      'salt lake city',
      'miami',
      'minneapolis',
      'phoenix',
      'pittsburgh',
    ],
  },
  {
    canonical: 'Canada',
    iso2: 'CA',
    iso3: 'CAN',
    aliases: ['canada', 'ca', 'can'],
    majorCities: [
      'toronto',
      'vancouver',
      'montreal',
      'ottawa',
      'waterloo',
      'calgary',
      'edmonton',
      'quebec city',
      'victoria',
      'halifax',
    ],
  },
  {
    canonical: 'United Kingdom',
    iso2: 'GB',
    iso3: 'GBR',
    aliases: [
      'united kingdom',
      'uk',
      'u.k.',
      'u.k',
      'great britain',
      'britain',
      'england',
      'scotland',
      'wales',
      'northern ireland',
    ],
    majorCities: [
      'london',
      'manchester',
      'edinburgh',
      'cambridge',
      'oxford',
      'bristol',
      'birmingham',
      'glasgow',
      'leeds',
      'belfast',
      'newcastle',
      'sheffield',
      'reading',
    ],
  },
  {
    canonical: 'Germany',
    iso2: 'DE',
    iso3: 'DEU',
    aliases: ['germany', 'deutschland', 'de', 'deu'],
    majorCities: [
      'berlin',
      'munich',
      'münchen',
      'frankfurt',
      'hamburg',
      'cologne',
      'köln',
      'stuttgart',
      'düsseldorf',
      'leipzig',
      'dresden',
      'nuremberg',
    ],
  },
  {
    canonical: 'Netherlands',
    iso2: 'NL',
    iso3: 'NLD',
    aliases: ['netherlands', 'holland', 'the netherlands', 'nl', 'nld'],
    majorCities: ['amsterdam', 'rotterdam', 'utrecht', 'the hague', 'eindhoven'],
  },
  {
    canonical: 'Ireland',
    iso2: 'IE',
    iso3: 'IRL',
    aliases: ['ireland', 'republic of ireland', 'ie', 'irl'],
    majorCities: ['dublin', 'cork', 'galway', 'limerick'],
  },
  {
    canonical: 'Australia',
    iso2: 'AU',
    iso3: 'AUS',
    aliases: ['australia', 'au', 'aus'],
    majorCities: ['sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'canberra'],
  },
  {
    canonical: 'Singapore',
    iso2: 'SG',
    iso3: 'SGP',
    aliases: ['singapore', 'sg', 'sgp'],
    majorCities: ['singapore'],
  },
  {
    canonical: 'France',
    iso2: 'FR',
    iso3: 'FRA',
    aliases: ['france', 'fr', 'fra'],
    majorCities: ['paris', 'lyon', 'toulouse', 'marseille', 'bordeaux', 'nantes'],
  },
  {
    canonical: 'Switzerland',
    iso2: 'CH',
    iso3: 'CHE',
    aliases: ['switzerland', 'schweiz', 'suisse', 'svizzera', 'ch', 'che'],
    majorCities: ['zurich', 'zürich', 'geneva', 'genève', 'lausanne', 'basel', 'bern'],
  },
  {
    canonical: 'Sweden',
    iso2: 'SE',
    iso3: 'SWE',
    aliases: ['sweden', 'sverige', 'se', 'swe'],
    majorCities: ['stockholm', 'gothenburg', 'malmö', 'uppsala'],
  },
  {
    canonical: 'Denmark',
    iso2: 'DK',
    iso3: 'DNK',
    aliases: ['denmark', 'danmark', 'dk', 'dnk'],
    majorCities: ['copenhagen', 'aarhus', 'odense', 'aalborg'],
  },
  {
    canonical: 'Spain',
    iso2: 'ES',
    iso3: 'ESP',
    aliases: ['spain', 'españa', 'es', 'esp'],
    majorCities: ['madrid', 'barcelona', 'valencia', 'seville', 'malaga'],
  },
  {
    canonical: 'Poland',
    iso2: 'PL',
    iso3: 'POL',
    aliases: ['poland', 'polska', 'pl', 'pol'],
    majorCities: ['warsaw', 'krakow', 'kraków', 'wroclaw', 'wroclaw', 'gdansk', 'poznan'],
  },
  {
    canonical: 'Israel',
    iso2: 'IL',
    iso3: 'ISR',
    aliases: ['israel', 'il', 'isr'],
    majorCities: ['tel aviv', 'jerusalem', 'haifa', 'herzliya', 'netanya', 'petah tikva'],
  },
];

const FOREIGN_REGIONS = [
  'emea',
  'europe',
  'eu',
  'latam',
  'americas',
  'north america',
  'apac',
  'anz',
];

export type RemoteScope = 'WORLDWIDE' | 'COUNTRY_SPECIFIC' | 'REGIONAL' | 'UNKNOWN';

export interface LocationAnalysis {
  rawLocation: string;
  detectedCountries: string[]; // Canonical country names
  isRemote: boolean;
  remoteScope: RemoteScope;
  isWorldwideRemote: boolean;
  detectedCities: string[];
  detectedRegions: string[];
}

/**
 * Returns true if input is explicitly a country name, ISO code, or alias (and not a city).
 */
export function isExplicitCountry(input: string): boolean {
  if (!input) return false;
  const cleaned = input.toLowerCase().trim().replace(/^[,\-\s]+|[,\-\s]+$/g, '');
  return COUNTRY_TAXONOMY.some(
    (c) =>
      c.canonical.toLowerCase() === cleaned ||
      c.iso2.toLowerCase() === cleaned ||
      c.iso3.toLowerCase() === cleaned ||
      c.aliases.includes(cleaned)
  );
}

/**
 * Normalizes an arbitrary country string/input to its Canonical Country Name.
 */
export function normalizeCountry(input: string): string | null {
  if (!input) return null;
  const cleaned = input.toLowerCase().trim().replace(/^[,\-\s]+|[,\-\s]+$/g, '');

  for (const c of COUNTRY_TAXONOMY) {
    if (cleaned === c.canonical.toLowerCase()) return c.canonical;
    if (cleaned === c.iso2.toLowerCase()) return c.canonical;
    if (cleaned === c.iso3.toLowerCase()) return c.canonical;
    if (c.aliases.includes(cleaned)) return c.canonical;
  }

  // Check if any major city matches exactly
  for (const c of COUNTRY_TAXONOMY) {
    if (c.majorCities.includes(cleaned)) return c.canonical;
  }

  return null;
}

/**
 * Checks if a string contains worldwide/global remote indicators.
 */
export function isWorldwideRemoteLocation(loc: string): boolean {
  const l = loc.toLowerCase();
  return (
    l === 'worldwide' ||
    l === 'global' ||
    l === 'anywhere' ||
    l === 'work from anywhere' ||
    l.includes('worldwide') ||
    l.includes('global remote') ||
    l.includes('anywhere in the world') ||
    l.includes('work from anywhere') ||
    l.includes('remote (global') ||
    l.includes('remote - global') ||
    l.includes('remote - worldwide') ||
    l.includes('remote (worldwide') ||
    l.includes('all locations')
  );
}

/**
 * Performs deep semantic analysis on a location string.
 */
export function analyzeLocation(locationStr: string | null | undefined): LocationAnalysis {
  if (!locationStr || !locationStr.trim()) {
    return {
      rawLocation: '',
      detectedCountries: [],
      isRemote: false,
      remoteScope: 'UNKNOWN',
      isWorldwideRemote: false,
      detectedCities: [],
      detectedRegions: [],
    };
  }

  const raw = locationStr.trim();
  const lower = raw.toLowerCase();
  const dotClean = lower.replace(/\./g, '');
  const cleanTokens = dotClean.split(/[^a-z0-9]/).filter(Boolean);

  const isRemote =
    lower === 'remote' ||
    lower.includes('remote') ||
    lower.includes('work from home') ||
    lower.includes('telecommute') ||
    lower.includes('anywhere') ||
    lower.includes('worldwide') ||
    lower.includes('global') ||
    lower.includes('virtual');

  const isWorldwide = isWorldwideRemoteLocation(lower);

  const detectedCountriesSet = new Set<string>();
  const detectedCities: string[] = [];
  const detectedRegions: string[] = [];

  for (const c of COUNTRY_TAXONOMY) {
    // 1. Check direct token match against aliases / iso
    for (const alias of c.aliases) {
      const aliasClean = alias.replace(/\./g, '');
      const isShort = aliasClean.length <= 3;
      if (cleanTokens.includes(aliasClean) || (!isShort && lower.includes(alias))) {
        detectedCountriesSet.add(c.canonical);
        break;
      }
    }

    // 2. Check major cities
    for (const city of c.majorCities) {
      if (lower.includes(city)) {
        detectedCountriesSet.add(c.canonical);
        detectedCities.push(city);
        break;
      }
    }
  }

  for (const r of FOREIGN_REGIONS) {
    if (cleanTokens.includes(r) || lower.includes(r)) {
      detectedRegions.push(r);
    }
  }

  const detectedCountries = Array.from(detectedCountriesSet);

  let remoteScope: RemoteScope = 'UNKNOWN';
  if (isWorldwide) {
    remoteScope = 'WORLDWIDE';
  } else if (isRemote && detectedCountries.length === 1 && detectedRegions.length === 0) {
    remoteScope = 'COUNTRY_SPECIFIC';
  } else if (isRemote && (detectedRegions.length > 0 || detectedCountries.length > 1)) {
    remoteScope = 'REGIONAL';
  }

  return {
    rawLocation: raw,
    detectedCountries,
    isRemote,
    remoteScope,
    isWorldwideRemote: isWorldwide,
    detectedCities,
    detectedRegions,
  };
}

/**
 * Validates whether a job's location is compatible with a user's location preferences.
 */
export function isCountryCompatible(
  jobLocationAnalysis: LocationAnalysis,
  userPreferredLocations: string[]
): { compatible: boolean; reason: string } {
  if (!userPreferredLocations || userPreferredLocations.length === 0) {
    return { compatible: true, reason: 'No location restrictions specified' };
  }

  // 1. Worldwide Remote matches ANY remote preference
  if (jobLocationAnalysis.isWorldwideRemote) {
    return {
      compatible: true,
      reason: 'Job is worldwide remote and open to candidates globally',
    };
  }

  // Resolve user preferred countries from explicit country preferences or city preferences
  const userCountriesSet = new Set<string>();
  const userRegionsSet = new Set<string>();

  for (const uLoc of userPreferredLocations) {
    const normCountry = normalizeCountry(uLoc);
    if (normCountry) {
      userCountriesSet.add(normCountry);
    }
    const uClean = uLoc.toLowerCase().trim();
    for (const r of FOREIGN_REGIONS) {
      if (uClean.includes(r)) {
        userRegionsSet.add(r);
      }
    }
  }

  const jobCountries = jobLocationAnalysis.detectedCountries;
  const jobRegions = jobLocationAnalysis.detectedRegions;

  // 2. If job has explicit foreign region tokens (e.g. Remote - EMEA)
  if (jobRegions.length > 0) {
    const hasRegionOverlap = jobRegions.some((r) => userRegionsSet.has(r));
    if (!hasRegionOverlap && !userCountriesSet.has('United States') && !userCountriesSet.has('United Kingdom') && !userCountriesSet.has('Germany')) {
      return {
        compatible: false,
        reason: `Job region (${jobRegions.join(', ')}) does not match user preferences`,
      };
    }
  }

  // 3. Check if job's detected country overlaps with user's country preferences
  if (jobCountries.length > 0) {
    const hasCountryOverlap = jobCountries.some((jc) => userCountriesSet.has(jc));
    if (hasCountryOverlap) {
      return {
        compatible: true,
        reason: `Job location (${jobCountries.join(', ')}) matches user preferred countries (${Array.from(userCountriesSet).join(', ')})`,
      };
    }

    if (userCountriesSet.size > 0 && !hasCountryOverlap) {
      return {
        compatible: false,
        reason: `Job country (${jobCountries.join(', ')}) does not match user country preferences (${Array.from(userCountriesSet).join(', ')})`,
      };
    }
  }

  // 4. Pure "Remote" / unspecified country remote with no detected foreign tokens
  if (jobCountries.length === 0 && jobRegions.length === 0 && jobLocationAnalysis.isRemote) {
    return {
      compatible: true,
      reason: 'Unspecified remote scope matches general remote preference',
    };
  }

  return {
    compatible: false,
    reason: `Job location "${jobLocationAnalysis.rawLocation}" does not match user preferred locations: ${userPreferredLocations.join(', ')}`,
  };
}
