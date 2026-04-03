const fs = require('fs');
const path = require('path');

function updateColorsScreen() {
    const file = path.join(__dirname, 'src/features/chart/ChartColorsScreen.tsx');
    let content = fs.readFileSync(file, 'utf8');

    if (!content.includes('import { ActionSheet }')) {
        content = content.replace(
            "import React, { useMemo } from 'react';",
            "import React, { useMemo, useState } from 'react';\nimport { ActionSheet } from '../../components/ActionSheet';"
        );
    }

    const customPicker = `
  const [activeKey, setActiveKey] = useState<keyof ChartColorsConfig | null>(null);
  const setChartColor = useUserPreferences((s) => s.setChartColor);

  const PRESET_COLORS = [
    '#2962FF', '#EF5350', '#26A69A', '#F59E0B', '#8B5CF6', 
    '#EC4899', '#14B8A6', '#1E293B', '#F8FAFC', '#FFFFFF', '#000000',
    'transparent'
  ];

  const handleSelectColor = (color: string) => {
    if (activeKey) {
      setChartColor(activeKey, color);
      setActiveKey(null);
    }
  };
`;

    if (!content.includes('setActiveKey(item.keyId)')) {
        content = content.replace('const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);', 'const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);\n' + customPicker);

        const pressableMatch = `<Pressable
                    style={({ pressed }) => [
                      styles.colorRow,
                      pressed && { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }
                    ]}
                  >`;
        const replacementPressable = `<Pressable
                    onPress={() => setActiveKey(item.keyId as any)}
                    style={({ pressed }) => [
                      styles.colorRow,
                      pressed && { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }
                    ]}
                  >`;

        content = content.split(pressableMatch).join(replacementPressable);

        const actionSheetCode = `
      <ActionSheet
        visible={!!activeKey}
        onClose={() => setActiveKey(null)}
        title="Select Color"
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, padding: 16, justifyContent: 'center' }}>
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
      </ActionSheet>
    </Screen>
`;

        content = content.replace('</Screen>', actionSheetCode);

        fs.writeFileSync(file, content);
        console.log('ChartColorsScreen updated.');
    } else {
        console.log('ChartColorsScreen already updated.');
    }
}

updateColorsScreen();
