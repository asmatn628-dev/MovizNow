const https = require('https');
https.get('https://v3.sg.media-imdb.com/suggestion/x/tt0111161.json', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data));
});
