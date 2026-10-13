const fs = require('fs');
let content = fs.readFileSync('src/sources/catalog.ts', 'utf8');

// 1. Fix imports
if (!content.includes('SmartRecruitersSourceConfig')) {
  content = content.replace(
    /WorkableSourceConfig,\s*\} from '\.\.\/collectors\/types\.js';/,
    "WorkableSourceConfig,\n  SmartRecruitersSourceConfig,\n} from '../collectors/types.js';"
  );
}

// 2. Add SmartRecruitersSourceDefinition
if (!content.includes('SmartRecruitersSourceDefinition')) {
  content = content.replace(
    /export interface WorkableSourceDefinition extends BaseSourceDefinition \{\s*atsType: 'WORKABLE';\s*config: WorkableSourceConfig;\s*\}/,
    "export interface WorkableSourceDefinition extends BaseSourceDefinition {\n  atsType: 'WORKABLE';\n  config: WorkableSourceConfig;\n}\n\nexport interface SmartRecruitersSourceDefinition extends BaseSourceDefinition {\n  atsType: 'SMARTRECRUITERS';\n  config: SmartRecruitersSourceConfig;\n}"
  );
}

// 3. Update SourceDefinition union
if (!content.includes('| SmartRecruitersSourceDefinition')) {
  content = content.replace(
    /\| WorkableSourceDefinition;/,
    "| WorkableSourceDefinition\n  | SmartRecruitersSourceDefinition;"
  );
}

// 4. Wipe out the broken CUSTOM block and replace with the SMARTRECRUITERS block.
// Let's find the start of WORKDAY and the start of ASHBY or LEVER... wait.
// Looking at the file, I can just find the index of "companyName: 'GitLab'," and work from there,
// but it's easier to find the index of "companyName: 'Autodesk'," (start of WORKDAY)
// and "companyName: 'Sarvam AI'" (start of ASHBY) or "companyName: 'Paytm'"
// Actually, earlier we saw my botched replace introduced:
//   {
//     companyName: 'Ubisoft',

const parts = content.split(/(\/\/ --- WORKDAY ---------------------------------------------------------------[\s\S]*?clientSite: 'External_Career_Site',\n    \},\n  \},)/);

if (parts.length > 1) {
    const beforeWorkday = parts[0];
    const workdaySection = parts[1];
    let afterWorkday = parts.slice(2).join('');
    
    // In afterWorkday, the next section should be ASHBY or LEVER.
    // Let's find "companyName: 'Paytm'," or "companyName: 'Linear',"
    const endMatch = afterWorkday.match(/(\s*\{\s*companyName: 'Paytm',[\s\S]*|\s*\/\/ --- ASHBY -----------------------------------------------------------------[\s\S]*)/);
    
    if (endMatch) {
        const theRest = endMatch[1];
        
        // We inject the SMARTRECRUITERS block between Workday and theRest
        const smartRecruitersBlock = 

  // --- SMARTRECRUITERS -------------------------------------------------------
  {
    companyName: 'CERN',
    officialDomain: 'jobs.smartrecruiters.com',
    careersUrl: 'https://careers.cern/',
    atsType: 'SMARTRECRUITERS',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      companyName: 'CERN',
      companyIdentifier: 'cern',
    },
  },
  {
    companyName: 'Freshworks',
    officialDomain: 'jobs.smartrecruiters.com',
    careersUrl: 'https://www.freshworks.com/company/careers/',
    atsType: 'SMARTRECRUITERS',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      companyName: 'Freshworks',
      companyIdentifier: 'freshworks',
    },
  },
  {
    companyName: 'Bosch India',
    officialDomain: 'jobs.smartrecruiters.com',
    careersUrl: 'https://careers.smartrecruiters.com/BoschGroup',
    atsType: 'SMARTRECRUITERS',
    isActive: true,
    scanIntervalMinutes: 30,
    config: {
      companyName: 'Bosch India',
      companyIdentifier: 'boschgroup',
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
;
        content = beforeWorkday + workdaySection + smartRecruitersBlock + theRest;
    }
}

fs.writeFileSync('src/sources/catalog.ts', content, 'utf8');
console.log('Fixed catalog.ts');
