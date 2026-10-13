import 'dotenv/config';

async function testFreshworks() {
  const res = await fetch('https://api.smartrecruiters.com/v1/companies/freshworks/postings?limit=100');
  const d = await res.json() as any;
  console.log(`Freshworks SmartRecruiters totalFound: ${d.totalFound}, content: ${d.content?.length}`);
  const chennaiJobs = (d.content || []).filter((j: any) => (j.location?.city || '').toLowerCase().includes('chennai'));
  const bangaloreJobs = (d.content || []).filter((j: any) => (j.location?.city || '').toLowerCase().includes('bangalore') || (j.location?.city || '').toLowerCase().includes('bengaluru'));
  const hydJobs = (d.content || []).filter((j: any) => (j.location?.city || '').toLowerCase().includes('hyderabad'));
  console.log(`Chennai: ${chennaiJobs.length}, Bangalore: ${bangaloreJobs.length}, Hyderabad: ${hydJobs.length}`);
  console.log('Sample Chennai Freshworks jobs:');
  for (const j of chennaiJobs.slice(0, 5)) {
    console.log(`  • ${j.name} (${j.location?.city}) -> https://jobs.smartrecruiters.com/freshworks/${j.id}`);
  }
}

testFreshworks().catch(console.error);
