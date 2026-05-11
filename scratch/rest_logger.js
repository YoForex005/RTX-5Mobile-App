const https = require('https');

const url = 'https://backend.orrnn.com/api/v1/candles/BTCUSD?timeframe=M1&limit=2';

https.get(url, {
  headers: {
    'Accept': 'application/json'
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(`STATUS: ${res.statusCode}`);
    try {
      const json = JSON.parse(data);
      console.log(JSON.stringify(json, null, 2));
    } catch(e) {
      console.log('RAW DATA:', data);
    }
  });
}).on('error', (e) => {
  console.error(e);
});
