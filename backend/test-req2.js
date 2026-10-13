fetch('https://io.spire2grow.com/ies/v1/p/requisition/_count')
  .then(r => r.text().then(t => console.log('Count GET:', r.status, t)))
  .catch(e => console.error(e));

fetch('https://io.spire2grow.com/ies/v1/p/requisition/search')
  .then(r => r.text().then(t => console.log('Search GET:', r.status, t)))
  .catch(e => console.error(e));
