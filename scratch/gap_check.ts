import { getCandleHistory } from '../rtx5-app/src/domain/candles/api/candles';
import { getExpectedNextCandleTime } from '../rtx5-app/src/features/chart/liveChartSync';
import * as fs from 'fs';

const SYMBOLS = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD'];
const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

async function run() {
  const results = [];

  for (const sym of SYMBOLS) {
    for (const tf of TIMEFRAMES) {
      console.log(`Fetching ${sym} ${tf}...`);
      try {
        const response = await getCandleHistory(sym, tf, 2000);
        const candles = response.candles;
        
        let gapCount = 0;
        let totalMissing = 0;
        
        if (candles.length > 0) {
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
        }
        
        results.push({
          symbol: sym,
          timeframe: tf,
          fetched: candles.length,
          gapCount,
          totalMissingBars: totalMissing,
        });
        console.log(`Processed ${sym} ${tf} - Fetched: ${candles.length}, Gaps: ${gapCount}`);
      } catch (e) {
        console.log(`Failed for ${sym} ${tf}: ${e.message}`);
      }
    }
  }

  console.table(results);
  fs.writeFileSync('gap_results.json', JSON.stringify(results, null, 2));
}

run();
