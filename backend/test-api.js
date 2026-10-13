fetch('https://io.spire2grow.com/ies/v1/p/workspaceId?domain=jobs.myntra.com')
  .then(r => r.text())
  .then(t => console.log(t))
  .catch(e => console.error(e));
