import 'dotenv/config';

async function testCompanyList() {
  const ghCompanies = [
    'dreamplug', 'cred', 'groww', 'inmobi', 'postman', 'razorpaysoftwareprivatelimited',
    'hackerrank', 'druva', 'pubmatic', 'observeai', 'atlan', 'sprinto', 'glance',
    'glanceinmobi', 'inmobi1', 'inmobicareers', 'loco', 'pocketfm', 'pocketaces',
    'stage', 'famup', 'fam', 'jupiter', 'jupiterapp', 'fi', 'epifi', 'slice',
    'khatabook', 'okcredit', 'dukaan', 'bikayi', 'mygate', 'nobroker', 'stanzaliving',
    'magicpin', 'curefit', 'cultfit', 'healthifyme', 'pristyncare', 'medibuddy',
    '1mg', 'tata1mg', 'pharmeasy', 'netmeds', 'caratlane', 'purplle', 'sugarcosmetics',
    'mamaearth', 'honasa', 'boat', 'noise', 'wakefit', 'furlenco', 'rentomojo',
    'spinny', 'cars24', 'droom', 'acko', 'digit', 'godigit', 'navi', 'turtlemint',
    'policybazaar', 'paisabazaar', 'bankbazaar', 'credgenics', 'perfios', 'signzy',
    'idfy', 'hyperverge', 'verloop', 'haptik', 'yellowai', 'gnani', 'reverie',
    'sarvam', 'krutrim', 'cohere', 'anthropic', 'scaleai'
  ];

  console.log('=== TESTING GREENHOUSE CANDIDATES ===');
  for (const c of ghCompanies) {
    try {
      const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${c}/jobs?content=true`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const d = await res.json() as any;
        const jobs = d.jobs || [];
        if (jobs.length > 0) {
          const indiaJobs = jobs.filter((j: any) => {
            const l = (j.location?.name || '').toLowerCase();
            return l.includes('india') || l.includes('bangalore') || l.includes('bengaluru') || l.includes('pune') || l.includes('chennai') || l.includes('hyderabad') || l.includes('mumbai') || l.includes('delhi') || l.includes('noida') || l.includes('gurgaon');
          });
          if (indiaJobs.length > 0) {
            console.log(`✅ GH: ${c} -> ${jobs.length} total, ${indiaJobs.length} India. Locs: ${Array.from(new Set(indiaJobs.map((j: any) => j.location?.name))).slice(0, 4).join('; ')}`);
          }
        }
      }
    } catch {}
  }

  const leverCompanies = [
    'meesho', 'cred', 'slice', 'sliceit', 'urbancompany', 'urbanclap', 'darwinbox',
    'kreditbee', 'leadsquared', 'corp-zeta', 'zeta', 'cars24', 'games24x7',
    'mindtickle', 'gohighlevel', 'harness', 'clevertap', 'moengage', 'sprinklr',
    'browserstack', 'dream11', 'dream-sports', 'dreamsports', 'mpl', 'mobilepremierleague',
    'zupee', 'winzo', 'nazara', 'nodwin', 'paytm', 'one97', 'bharatpe', 'phonepe',
    'mobikwik', 'freecharge', 'rupeek', 'moneyview', 'cashe', 'earlysalary', 'fibe',
    'indifi', 'lendingkart', 'flexiloans', 'progcap', 'velocity', 'getvantage',
    'bajajfinserv', 'kotak', 'axis', 'icici', 'hdfc', 'tcs', 'infosys', 'wipro',
    'hcl', 'techmahindra', 'ltimindtree', 'mphasis', 'hexaware', 'coforge', 'birlasoft',
    'zensar', 'cybage', 'kpit', 'tataelxsi', 'ltts', 'questglobal', 'einfochips'
  ];

  console.log('\n=== TESTING LEVER CANDIDATES ===');
  for (const c of leverCompanies) {
    try {
      const res = await fetch(`https://api.lever.co/v0/postings/${c}?mode=json`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const jobs = await res.json() as any[];
        if (jobs.length > 0) {
          const indiaJobs = jobs.filter((j: any) => {
            const l = (j.categories?.location || '').toLowerCase();
            return l.includes('india') || l.includes('bangalore') || l.includes('bengaluru') || l.includes('pune') || l.includes('chennai') || l.includes('hyderabad') || l.includes('mumbai') || l.includes('delhi') || l.includes('noida') || l.includes('gurgaon');
          });
          if (indiaJobs.length > 0) {
            console.log(`✅ Lever: ${c} -> ${jobs.length} total, ${indiaJobs.length} India. Locs: ${Array.from(new Set(indiaJobs.map((j: any) => j.categories?.location))).slice(0, 4).join('; ')}`);
          }
        }
      }
    } catch {}
  }
}

testCompanyList().catch(console.error);
