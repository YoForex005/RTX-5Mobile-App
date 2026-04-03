const fs = require('fs');
const file = 'src/features/trade/TradeScreen.tsx';
let content = fs.readFileSync(file, 'utf8');

const sIdx = content.indexOf('<View style={s.summaryTop}>');
const eIdx = content.indexOf('<View style={[s.positionsHeader, { borderBottomColor: T.border }]}>');

if (sIdx === -1 || eIdx === -1) {
  console.log('Markers not found', { sIdx, eIdx });
  process.exit(1);
}

// Ensure we remove the closing </View> corresponding to summaryBlock
// The text from sIdx to eIdx includes the summaryTop and metricsCard, and ends right before positionsHeader.
// Wait, the summaryBlock closes before positionsHeader. 
// Let's find the exact string to replace.

const before = content.substring(0, sIdx);
const after = content.substring(content.lastIndexOf('</View>', eIdx) + 7, content.length);

const replacement = `<View style={{ paddingHorizontal: 28, paddingVertical: 32 }}>
  {/* The Hero: Unrealized P/L */}
  <View style={{ alignItems: 'flex-start', marginBottom: 36, paddingBottom: 28, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : T.border }}>
    <Text style={{ fontSize: 13, fontWeight: '800', color: T.textSub, letterSpacing: 1.5, textTransform: 'uppercase' }}>
      Unrealized P/L
    </Text>
    <Animated.Text 
      style={{ 
        fontSize: 48, 
        fontWeight: '800', 
        color: dynamicFloating >= 0 ? T.up : T.down, 
        opacity: pulseAnim, 
        marginTop: 6, 
        letterSpacing: -1.5, 
        fontVariant: ['tabular-nums'],
        marginLeft: -2
      }}>
      {dynamicFloating >= 0 ? '+' : ''}{fmt.pnl(dynamicFloating)}
    </Animated.Text>
  </View>
  
  {/* The rest stacked vertically */}
  <View style={{ gap: 28 }}>
     <View>
       <Text style={{ fontSize: 12, color: T.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
         Balance <Text style={{fontSize: 10, color: T.textFaint}}>({account.currency || 'USD'})</Text>
       </Text>
       <Text style={{ fontSize: 24, color: T.text, fontWeight: '700', marginTop: 4, letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}>
         {fmt.int(safeBalance)}
       </Text>
     </View>

     <View>
       <Text style={{ fontSize: 12, color: T.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
         Equity
       </Text>
       <Text style={{ fontSize: 24, color: T.text, fontWeight: '700', marginTop: 4, letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}>
         {fmt.int(dynamicEquity)}
       </Text>
     </View>

     <View>
       <Text style={{ fontSize: 12, color: T.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
         Margin
       </Text>
       <Text style={{ fontSize: 24, color: T.text, fontWeight: '700', marginTop: 4, letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}>
         {fmt.decimal(safeMargin, 2)}
       </Text>
     </View>

     <View>
       <Text style={{ fontSize: 12, color: T.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
         Free Margin
       </Text>
       <Text style={{ fontSize: 24, color: T.text, fontWeight: '700', marginTop: 4, letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}>
         {fmt.decimal(dynamicEquity - safeMargin, 2)}
       </Text>
     </View>

     <View>
       <Text style={{ fontSize: 12, color: T.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
         Margin Level
       </Text>
       <Text style={{ fontSize: 24, color: T.text, fontWeight: '700', marginTop: 4, letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}>
         {fmt.decimal(dynamicMarginLevel, 2)}%
       </Text>
     </View>
  </View>
`;

let newContent = before + replacement + content.substring(eIdx - 14); 
// We know s.positionsHeader has some spaces/newlines before it.
// Actually, let's just use string replace using exact snippet from the file!

console.log("Using exact search replace from substring...");
let exactTarget = content.substring(sIdx, eIdx);
// The exact target currently includes <View style={s.summaryTop}> ... </View> ... \n      <View style={[s.positionsHeader...
// We just want to replace everything inside <View style={[s.summaryBlock... ]}> ... </View>

const blockStart = content.lastIndexOf('<View style={[s.summaryBlock', sIdx);
const blockEnd = content.indexOf('</View>', content.indexOf('</View>', content.indexOf('</View>', content.indexOf('metricsCard'))));

// Let's just use a simpler regex or manual search.

fs.writeFileSync(file, newContent);
console.log('Patch complete.');
