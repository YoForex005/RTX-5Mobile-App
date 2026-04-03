const fs = require('fs');
const file = 'src/features/trade/TradeScreen.tsx';
let content = fs.readFileSync(file, 'utf8');

const startMarker = '<View style={s.summaryTop}>';
const endMarker = '        </View>\n      </View>\n\n      <View style={[s.positionsHeader';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.log('Markers not found');
  process.exit(1);
}

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
        marginLeft: -2 // optical alignment
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

let newContent = content.substring(0, startIndex) + replacement + content.substring(endIndex);

fs.writeFileSync(file, newContent);
console.log('Patch complete.');
