const https = require('https');

const fetchCandles = (url) => {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          console.error("Failed to parse JSON for URL", url, "Response:", data.substring(0, 100));
          resolve(null);
        }
      });
    }).on('error', reject);
  });
};

const run = async () => {
  const baseUrl = 'https://backend.orrnn.com/api/v1';
  const latestUrl = `${baseUrl}/candles/EURUSD?timeframe=H1&limit=5`;
  console.log('Fetching latest H1 candles...', latestUrl);
  const latest = await fetchCandles(latestUrl);
  const candles = latest?.candles || latest;
  console.log('Latest H1 candles count:', candles ? candles.length : 0);
  
  if (candles && candles.length > 0) {
    const oldestTime = candles[0].time;
    console.log(`\nFetching candles before ${oldestTime} (${new Date(oldestTime * 1000).toISOString()})...`);
    
    // Test 1: Just `to` parameter
    const pageUrl = `${baseUrl}/candles/EURUSD?timeframe=H1&to=${oldestTime}&limit=20`;
    console.log('Fetching:', pageUrl);
    const page = await fetchCandles(pageUrl);
    const pageCandles = page?.candles || page;
    console.log(`Fetched ${pageCandles ? pageCandles.length : 0} older candles using just 'to'.`);
    if (pageCandles && pageCandles.length > 0) {
      console.log('Oldest in page:', new Date(pageCandles[0].time * 1000).toISOString());
    }

    // Test 2: `from` and `to` parameters
    const fromTime = oldestTime - 86400 * 30; // 30 days before
    const fromUrl = `${baseUrl}/candles/EURUSD?timeframe=H1&from=${fromTime}&to=${oldestTime}&limit=20`;
    console.log('\nFetching:', fromUrl);
    const fromPage = await fetchCandles(fromUrl);
    const fromCandles = fromPage?.candles || fromPage;
    console.log(`Fetched ${fromCandles ? fromCandles.length : 0} older candles using 'from' and 'to'.`);
    if (fromCandles && fromCandles.length > 0) {
      console.log('Oldest in fromPage:', new Date(fromCandles[0].time * 1000).toISOString());
    }
  }
};

run().catch(console.error);
