fetch('https://io.spire2grow.com/ies/v1/p/requisition/_count', {
  headers: {
    'workspace': 'MYNTRA-93as3'
  }
})
.then(r => r.json())
.then(j => console.log('Count:', j))
.catch(e => console.error(e));

fetch('https://io.spire2grow.com/ies/v1/p/requisition/_search', {
  method: 'POST',
  headers: {
    'workspace': 'MYNTRA-93as3',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    "page": 0,
    "size": 5
  })
})
.then(r => r.json())
.then(j => console.log('Search POST:', JSON.stringify(j).substring(0, 300)))
.catch(e => console.error('POST search failed:', e));
