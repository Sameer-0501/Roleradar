fetch('https://careers.cognizant.com/global/en/search-results')
  .then(res => console.log('Status:', res.status))
  .catch(err => console.error('Error:', err.message));
