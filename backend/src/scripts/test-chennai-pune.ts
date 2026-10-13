import 'dotenv/config';

async function testChennaiCompanies() {
  console.log('--- Probing Chennai / Pune / Hyderabad Companies ---');
  
  // Test Chargebee
  try {
    const res = await fetch('https://boards-api.greenhouse.io/v1/boards/chargebee/jobs?content=true');
    console.log('Chargebee GH status:', res.status);
    if (res.ok) {
      const d = await res.json() as any;
      console.log('Chargebee jobs:', d.jobs?.length);
      const ind = (d.jobs || []).filter((j: any) => (j.location?.name || '').toLowerCase().includes('india') || (j.location?.name || '').toLowerCase().includes('chennai') || (j.location?.name || '').toLowerCase().includes('bangalore'));
      console.log('Chargebee India jobs:', ind.length);
      console.log('Chargebee locations:', Array.from(new Set(ind.map((j: any) => j.location?.name))));
    }
  } catch (e) { console.error('Chargebee err:', e); }

  // Test Thoughtworks
  try {
    const res = await fetch('https://boards-api.greenhouse.io/v1/boards/thoughtworks/jobs?content=true');
    console.log('Thoughtworks GH status:', res.status);
    if (res.ok) {
      const d = await res.json() as any;
      console.log('Thoughtworks jobs:', d.jobs?.length);
      const ind = (d.jobs || []).filter((j: any) => (j.location?.name || '').toLowerCase().includes('india') || (j.location?.name || '').toLowerCase().includes('chennai') || (j.location?.name || '').toLowerCase().includes('pune') || (j.location?.name || '').toLowerCase().includes('bangalore') || (j.location?.name || '').toLowerCase().includes('hyderabad') || (j.location?.name || '').toLowerCase().includes('gurgaon') || (j.location?.name || '').toLowerCase().includes('coimbatore'));
      console.log('Thoughtworks India jobs:', ind.length);
      console.log('Thoughtworks locations:', Array.from(new Set(ind.map((j: any) => j.location?.name))));
      console.log('Thoughtworks sample:', ind.slice(0, 5).map((j: any) => `${j.title} (${j.location?.name})`));
    }
  } catch (e) { console.error('Thoughtworks err:', e); }

  // Test Publicis Sapient
  try {
    const res = await fetch('https://api.smartrecruiters.com/v1/companies/PublicisSapient/postings?limit=100');
    console.log('Publicis Sapient SR status:', res.status);
    if (res.ok) {
      const d = await res.json() as any;
      console.log('Publicis Sapient totalFound:', d.totalFound, 'content:', d.content?.length);
      const ind = (d.content || []).filter((j: any) => (j.location?.country || '').toLowerCase() === 'in' || (j.location?.city || '').toLowerCase().includes('gurgaon') || (j.location?.city || '').toLowerCase().includes('bengaluru') || (j.location?.city || '').toLowerCase().includes('noida') || (j.location?.city || '').toLowerCase().includes('pune'));
      console.log('Publicis Sapient India jobs:', ind.length);
      console.log('Publicis Sapient locations:', Array.from(new Set(ind.map((j: any) => `${j.location?.city}, ${j.location?.country}`))));
    }
  } catch (e) { console.error('Publicis err:', e); }
}

testChennaiCompanies().catch(console.error);
