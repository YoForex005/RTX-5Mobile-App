import { useEffect } from 'react';
import { getCandleHistory } from '../../domain/candles/api/candles';
import { SUPPORTED_TIMEFRAMES, getBucketGapCount, normalizeTimeframeStrict } from '../../domain/candles/core/timeframeUtils';
import { getStoredAccessToken } from '../../domain/candles/ws/candlesSocket/authToken';
import { CandlesWebSocketService } from '../../domain/candles/ws/candlesSocket/CandlesWebSocketService';

const TEST_SYMBOLS = ['EURUSD', 'GBPUSD', 'XAUUSD', 'BTCUSD'];

export function useDataAnalyzer() {
  useEffect(() => {
    const runAnalysis = async () => {
      const token = getStoredAccessToken();
      if (!token) {
        console.log('[DataAnalyzer] Waiting for user to log in...');
        return;
      }
      
      console.log('\n\n======================================================');
      console.log('🚀 DEEP RESEARCH: BACKEND API DATA ANALYSIS STARTING');
      console.log('======================================================\n');
      
      for (const symbol of TEST_SYMBOLS) {
        for (const tf of SUPPORTED_TIMEFRAMES) {
          if (tf === 'W1' || tf === 'MN') continue; // User said skip week and month
          
          const timeframe = normalizeTimeframeStrict(tf);
          if (!timeframe) continue;

          try {
            console.log(`Fetching REST History for ${symbol} ${timeframe}...`);
            const history = await getCandleHistory(symbol, timeframe, 1000);
            const candles = history.candles;
            
            if (candles.length === 0) {
              console.log(`❌ ${symbol} ${timeframe}: 0 candles returned.`);
              continue;
            }

            let gapCount = 0;
            let maxGap = 0;
            let invalidOhlc = 0;

            for (let i = 0; i < candles.length - 1; i++) {
              const current = candles[i];
              const next = candles[i+1];
              
              if (current.high < Math.max(current.open, current.close) || current.low > Math.min(current.open, current.close)) {
                invalidOhlc++;
              }

              const gaps = getBucketGapCount(current.time, next.time, timeframe);
              if (gaps > 1) {
                gapCount += (gaps - 1);
                maxGap = Math.max(maxGap, gaps - 1);
              }
            }

            const lastCandle = candles[candles.length - 1];
            const nowSeconds = Math.floor(Date.now() / 1000);
            const ageSeconds = nowSeconds - lastCandle.time;
            
            console.log(`✅ ${symbol} ${timeframe}: ${candles.length} candles.`);
            console.log(`   -> Missing Buckets (Gaps): ${gapCount} total gaps (Max contiguous gap: ${maxGap})`);
            console.log(`   -> Invalid OHLC Geometry: ${invalidOhlc}`);
            console.log(`   -> Last Candle Age: ${ageSeconds} seconds ago (Is forming? ${!lastCandle.closed})`);
            
          } catch (error: any) {
            console.log(`❌ Error fetching ${symbol} ${timeframe}: ${error.message}`);
          }
        }
      }
      
      console.log('\n======================================================');
      console.log('✅ DEEP RESEARCH ANALYSIS COMPLETE');
      console.log('======================================================\n\n');

      console.log('\n📡 Listening for WebSocket Live Candles...');
      const wsService = CandlesWebSocketService.getInstance();
      const wsListener = (event: any) => {
        if (event.type === 'replace_last' || event.type === 'append') {
          console.log(`[WS Live Candle] ${event.symbol} ${event.tf}:`, JSON.stringify(event.candle));
        }
      };
      wsService.addStreamListener(wsListener);
      
      // Stop listening after 30 seconds to avoid spam
      setTimeout(() => {
        wsService.removeStreamListener(wsListener);
        console.log('\n🛑 Stopped WebSocket Logging');
      }, 30000);
    };

    // Run after a short delay to let app initialize
    setTimeout(runAnalysis, 5000);
  }, []);
}
