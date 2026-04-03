const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/features/chart/ChartColorsScreen.tsx');
let content = fs.readFileSync(file, 'utf8');

let startIndex = content.indexOf('<Pressable\\n                    style={({ pressed })');
if (startIndex === -1) startIndex = content.indexOf('<Pressable\\r\\n                    style={({ pressed })');

if (content.includes('style={({ pressed }) => [')) {
    // A bit more resilient approach
    content = content.replace(
        /style=\\{\\(\\{ pressed \\}) => \\[/g,
        'onPress={() => setActiveKey(item.keyId)}\\n                    style={({ pressed }) => ['
    );
    // But this will replace ALL occurrences of style={({ pressed }) => [. Let's make sure it's the right one.
}

// better:
const orig = fs.readFileSync(file, 'utf8');
const lines = orig.split(/\\r?\\n/);
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('<Pressable') && lines[i+1] && lines[i+1].includes('style={({ pressed }) => [')) {
        if (!lines[i].includes('onPress')) {
            lines[i] = lines[i] + '\\n                    onPress={() => setActiveKey(item.keyId)}';
            break; // only do it for the color row, which is the first pressable mapping
        }
    }
}
fs.writeFileSync(file, lines.join('\\n'));
console.log('Fixed Pressable');
