const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/features/chart/ChartColorsScreen.tsx');
const orig = fs.readFileSync(file, 'utf8');
const lines = orig.split(/\r?\n/);

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('<Pressable') && lines[i+1] && lines[i+1].includes('style={({ pressed }) => [')) {
        if (!lines[i].includes('onPress')) {
            lines[i] = lines[i].replace('<Pressable', '<Pressable onPress={() => setActiveKey(item.keyId)}');
            break; 
        }
    }
}

fs.writeFileSync(file, lines.join('\n'));
console.log('Fixed Pressable successfully');
