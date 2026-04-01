const fs = require('fs');
const file = 'src/features/chart/plugins/drawingToolsBundleString.ts';
let c = fs.readFileSync(file, 'utf8');
// The file is corrupted. We extract the raw string value (everything after 'export const DRAWING_TOOLS_JS = ')
// excluding the trailing '\;'
let raw = c.substring(34, c.length - 2); 
// Then we decode it, wrap it properly with quotes, and stringify
fs.writeFileSync(file, 'export const DRAWING_TOOLS_JS = ' + JSON.stringify(raw) + ';\n');
console.log('Fixed');
