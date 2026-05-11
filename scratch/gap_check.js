const fs = require('fs');

const PUBLIC_API_V1_BASE_URL = 'https://backend.orrnn.com/api/v2';
const PUBLIC_API_V1_BASE_URL_FALLBACK = 'https://backend.orrnn.com/api/v1';

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Origin': 'http://localhost:8081',
      'Referer': 'http://localhost:8081/'
    }
  });
  if (!res.ok) {
    throw new Error(`HTTP error! status: ${res.status}`);
  }
  return await res.json();
}

function getExpectedNextCandleTime(currentTime, timeframe) {
  const d = new Date(currentTime * 1000);
  switch (timeframe) {
    case 'M1': d.setUTCMinutes(d.getUTCMinutes() + 1); break;
    case 'M5': d.setUTCMinutes(d.getUTCMinutes() + 5); break;
    case 'M15': d.setUTCMinutes(d.getUTCMinutes() + 15); break;
    case 'M30': d.setUTCMinutes(d.getUTCMinutes() + 30); break;
    case 'H1': d.setUTCHours(d.getUTCHours() + 1); break;
    case 'H4': d.setUTCHours(d.getUTCHours() + 4); break;
    case 'D1': d.setUTCDate(d.getUTCDate() + 1); break;
  }
  return Math.floor(d.getTime() / 1000);
}

const SYMBOLS = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD'];
const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

async function run() {
  const results = [];

  for (const sym of SYMBOLS) {
    for (const tf of TIMEFRAMES) {
      const urls = [
        `${PUBLIC_API_V1_BASE_URL_FALLBACK}/candles/${sym}?timeframe=${tf}&limit=2000`,
        `${PUBLIC_API_V1_BASE_URL_FALLBACK}/candles?symbol=${sym}&timeframe=${tf}&limit=2000`,
      ];
      
      let data = null;
      let successUrl = null;
      for (const url of urls) {
        try {
          data = await fetchJson(url);
          successUrl = url;
          break;
        } catch(e) {
          // ignore
        }
      }

      if (!data) {
        console.log(`Failed all URLs for ${sym} ${tf}`);
        continue;
      }

      let candles = Array.isArray(data) ? data : (data.candles || data.data || data.items || data.results);
      if (!Array.isArray(candles) && data.data && Array.isArray(data.data.candles)) candles = data.data.candles;
      
      if (!candles || candles.length === 0) {
        console.log(`No candles for ${sym} ${tf}`);
        continue;
      }

      candles.sort((a, b) => a.time - b.time);
      
      let gapCount = 0;
      let totalMissing = 0;
      
      for (let i = 0; i < candles.length - 1; i++) {
        const current = candles[i];
        const next = candles[i + 1];
        const expected = getExpectedNextCandleTime(current.time, tf);
        if (next.time > expected) {
          gapCount++;
          let missing = 0;
          let temp = expected;
          while (temp < next.time && missing < 1000) {
            missing++;
            temp = getExpectedNextCandleTime(temp, tf);
          }
          totalMissing += missing;
        }
      }
      
      results.push({
        symbol: sym,
        timeframe: tf,
        fetched: candles.length,
        gapCount,
        totalMissingBars: totalMissing,
      });
      console.log(`Processed ${sym} ${tf} - Fetched: ${candles.length}, Gaps: ${gapCount}, Missing Bars: ${totalMissing}`);
    }
  }

  let mdTable = "| Symbol | Timeframe | Fetched | Gap Count | Total Missing Bars |\n|---|---|---|---|---|\n";
  for (const r of results) {
    mdTable += `| ${r.symbol} | ${r.timeframe} | ${r.fetched} | ${r.gapCount} | ${r.totalMissingBars} |\n`;
  }
  fs.writeFileSync('gap_analysis_report.md', mdTable);
  console.log("Wrote gap_analysis_report.md");
}

run();
