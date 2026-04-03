const fs = require('fs');
const path = require('path');

function fixColorsScreen() {
    const file = path.join(__dirname, 'src/features/chart/ChartColorsScreen.tsx');
    let content = fs.readFileSync(file, 'utf8');

    // Remove ActionSheet and ActionSheet imports
    content = content.replace("import { ActionSheet } from '../../components/ActionSheet';", "import { Modal } from 'react-native';");
    
    // Replace the ActionSheet component with standard Modal
    const actionSheetStartIndex = content.indexOf('<ActionSheet');
    if (actionSheetStartIndex !== -1) {
        const actionSheetEndIndex = content.indexOf('</ActionSheet>') + '</ActionSheet>'.length;
        
        const modalCode = `
      <Modal transparent visible={!!activeKey} animationType="slide" onRequestClose={() => setActiveKey(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={() => setActiveKey(null)}>
          <Pressable style={{ backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 }} onPress={(e) => e.stopPropagation()}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: isDark ? '#FFFFFF' : '#000000', marginBottom: 16, textAlign: 'center' }}>Select Color</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
              {PRESET_COLORS.map(c => (
                <Pressable
                  key={c}
                  onPress={() => handleSelectColor(c)}
                  style={{
                    width: 48, height: 48, borderRadius: 24, backgroundColor: c,
                    borderWidth: c === 'transparent' ? 1 : 2,
                    borderColor: c === 'transparent' ? (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)') : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'),
                    alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden'
                  }}
                >
                  {c === 'transparent' && <View style={{ width: 60, height: 2, backgroundColor: '#EF5350', transform: [{ rotate: '45deg' }] }} />}
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
`;
        content = content.substring(0, actionSheetStartIndex) + modalCode + content.substring(actionSheetEndIndex);
        fs.writeFileSync(file, content);
        console.log('Fixed ChartColorsScreen');
    }
}

function fixHistoryScreen() {
    const file = path.join(__dirname, 'src/features/history/HistoryScreen.tsx');
    try {
        let content = fs.readFileSync(file, 'utf8');
        content = content.replace(/fmt\.price\(([^,]+),\s*decimals\)/g, "fmt.price($1)");
        fs.writeFileSync(file, content);
        console.log('Fixed HistoryScreen');
    } catch(e) {
        console.log('HistoryScreen not found or no issue');
    }
}

fixColorsScreen();
fixHistoryScreen();
