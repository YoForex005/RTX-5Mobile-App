const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/features/chart/ChartColorsScreen.tsx');
let content = fs.readFileSync(file, 'utf8');

// Replace chartColors reading logic
content = content.replace(
    '  const chartColors = useUserPreferences((s) => s.chartColors);',
    "  const chartColors = useUserPreferences((s) => s.chartColors);\n  const router = require('expo-router').useRouter();\n  const [draftColors, setDraftColors] = useState(chartColors);"
);

content = content.replace(
    '  const handleSelectColor = (color: string) => {\n    if (activeKey) {\n      setChartColor(activeKey, color);\n      setActiveKey(null);\n    }\n  };',
    '  const handleSelectColor = (color: string) => {\n    if (activeKey) {\n      setDraftColors(prev => ({...prev, [activeKey]: color}));\n      setActiveKey(null);\n    }\n  };\n\n  const handleSave = () => {\n    Object.keys(draftColors).forEach(k => setChartColor(k as keyof ChartColorsConfig, draftColors[k as keyof ChartColorsConfig]));\n    router.back();\n  };'
);

// Replace ALL instances of mapping from `chartColors[` to `draftColors[`
content = content.replace(/chartColors\[item\.keyId\]/g, 'draftColors[item.keyId]');

const saveButtonStr = `
      {/* Save Button */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 34 : 24, paddingTop: 16, backgroundColor: isDark ? '#121212' : '#FFFFFF', borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.05)' : '#E2E8F0' }}>
        <Pressable 
          onPress={handleSave}
          style={({pressed}) => [{
            backgroundColor: T.primary,
            height: 54,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
          }, pressed && { opacity: 0.8 }]}
        >
          <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '600' }}>Save Settings</Text>
        </Pressable>
      </View>
`;

// Insert the save button before the modal
content = content.replace('<Modal transparent visible={!!activeKey}', saveButtonStr + '\n      <Modal transparent visible={!!activeKey}');

// Replace scrollContent padding wrapper to accommodate the fixed bar
content = content.replace('paddingBottom: 40', 'paddingBottom: 100');

fs.writeFileSync(file, content);
console.log('Successfully added Draft mode and Save button');
