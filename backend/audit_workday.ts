import 'dotenv/config';
import { analyzeLocation } from './src/matching/country-normalizer.js';
import { parseExperienceRequirements } from './src/matching/experience-parser.js';
import { matchRole } from './src/matching/role-matcher.js';
import { getDb } from './src/database/connection.js';
import { schema } from './src/database/index.js';

interface WorkdayPostingSummary {
  title?: string | null;
  externalPath?: string | null;
  locationsText?: string | null;
  postedOn?: string | null;
  bulletFields?: string[] | null;
}

interface WorkdaySearchResponse {
  total?: number;
  jobPostings?: WorkdayPostingSummary[];
}

async function fetchWorkday(host: string, tenant: string, clientSite: string) {
  const allJobs: any[] = [];
  const limit = 20;
  let total = 0;
  let page = 0;
  let hasMore = true;

  console.log(`\n=================== Fetching ${host} ===================`);
  
  while (hasMore) {
    const offset = page * limit;
    const url = `https://${host}/wday/cxs/${tenant}/${clientSite}/jobs`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
        body: JSON.stringify({
          appliedFacets: {},
          limit,
          offset,
          searchText: ''
        })
      });

      if (!response.ok) {
        console.error(`HTTP Error: ${response.status} for ${url}`);
        break;
      }

      const json = await response.json() as WorkdaySearchResponse;
      if (json.total) total = json.total;
      
      const postings = json.jobPostings || [];
      if (postings.length === 0) break;
      
      for (const p of postings) {
        let reqId = '';
        if (p.bulletFields && p.bulletFields.length > 0) {
          reqId = p.bulletFields[0] || '';
        } else if (p.externalPath) {
          const m = p.externalPath.match(/_([A-Za-z0-9-]+)$/);
          if (m) reqId = m[1];
        }

        let loc = p.locationsText || '';
        if (!loc && p.bulletFields && p.bulletFields.length > 1) {
          loc = p.bulletFields[1] || '';
        }

        allJobs.push({
          title: p.title || '',
          externalPath: p.externalPath || '',
          reqId,
          location: loc,
          postedOn: p.postedOn || ''
        });
      }

      console.log(`Fetched page ${page + 1}: ${postings.length} jobs (Total so far: ${allJobs.length}/${total})`);
      
      if (allJobs.length >= total) {
        hasMore = false;
      } else {
        page++;
        // Limit to 500 pages max just in case
        if (page > 500) hasMore = false;
      }
    } catch (e) {
      console.error('Fetch error:', e);
      break;
    }
  }

  return { total, jobs: allJobs };
}

async function analyzeCompany(companyName: string, host: string, tenant: string, clientSite: string) {
  const result = await fetchWorkday(host, tenant, clientSite);
  
  let totalIndia = 0;
  let fresherCompatible = 0;
  let both = 0;
  let experienced = 0;
  let unknownExp = 0;
  
  let itFresher = 0;
  let nonItFresher = 0;
  
  const fresherJobs: any[] = [];
  
  for (const job of result.jobs) {
    const locAnalysis = analyzeLocation(job.location);
    const isIndia = locAnalysis.detectedCountries.includes('India');
    
    if (isIndia) {
      totalIndia++;
      
      // Parse experience - passing empty string for description and requirements as they aren't in list view
      const exp = parseExperienceRequirements(job.title, '', '');
      const cls = exp.classification;
      
      if (cls === 'FRESHER_COMPATIBLE') fresherCompatible++;
      else if (cls === 'BOTH') both++;
      else if (cls === 'EXPERIENCED') experienced++;
      else unknownExp++;
      
      if (cls === 'FRESHER_COMPATIBLE' || cls === 'BOTH') {
        const titleLower = job.title.toLowerCase();
        // Simple IT vs Non-IT heuristic
        const isIT = titleLower.includes('engineer') || titleLower.includes('developer') || 
                     titleLower.includes('software') || titleLower.includes('data') || 
                     titleLower.includes('qa ') || titleLower.includes('sdet') || 
                     titleLower.includes('cloud') || titleLower.includes('it support') || titleLower.includes('devops');
                     
        if (isIT) {
          itFresher++;
        } else {
          nonItFresher++;
        }
        
        fresherJobs.push({
          jobId: job.reqId,
          title: job.title,
          role: matchRole(job.title),
          rawLocation: job.location,
          normLocation: locAnalysis.primaryLocation,
          classification: cls,
          isIT,
          url: `https://${host}/${clientSite}${job.externalPath}`,
          posted: job.postedOn
        });
      }
    }
  }
  
  return {
    totalGlobal: result.total,
    totalFetched: result.jobs.length,
    totalIndia,
    fresherCompatible,
    both,
    experienced,
    unknownExp,
    itFresher,
    nonItFresher,
    fresherJobs
  };
}

async function checkDb(name: string) {
    const db = getDb();
    const companies = await db.select().from(schema.companies);
    const matches = companies.filter(c => c.name.toLowerCase().includes(name.toLowerCase()));
    return matches;
}

async function run() {
  const wf = await analyzeCompany('Wells Fargo', 'wf.wd1.myworkdayjobs.com', 'wf', 'WellsFargoJobs');
  const cisco = await analyzeCompany('Cisco', 'cisco.wd5.myworkdayjobs.com', 'cisco', 'Cisco_Careers');
  
  console.log('\n=================== WELLS FARGO RESULTS ===================');
  console.log(JSON.stringify(wf, null, 2));
  
  console.log('\n=================== CISCO RESULTS ===================');
  console.log(JSON.stringify(cisco, null, 2));
  
  console.log('\n=================== DB CHECK ===================');
  const dbWf = await checkDb('Wells Fargo');
  const dbCisco = await checkDb('Cisco');
  console.log('Wells Fargo in DB:', dbWf.map(c => ({id: c.id, name: c.name, active: c.is_active})));
  console.log('Cisco in DB:', dbCisco.map(c => ({id: c.id, name: c.name, active: c.is_active})));
  
  process.exit(0);
}

run().catch(console.error);
