const fs = require('fs');
const path = require('path');

const rootDir = 'c:\\Users\\ADMIN\\RTX-5Mobile-App';
const structureFile = path.join(rootDir, 'Project structure.md');

if (!fs.existsSync(structureFile)) {
  console.error('Project structure.md not found');
  process.exit(1);
}

const content = fs.readFileSync(structureFile, 'utf8');
const lines = content.split('\n');

const treeLines = [];
let parsingTree = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('c:\\Users\\ADMIN\\RTX-5Mobile-App\\')) {
    parsingTree = true;
    continue;
  }
  if (parsingTree) {
    // If the line is empty or doesn't look like tree, continue
    if (line.trim() === '') continue;
    // Tree lines start with spaces or │ or ├ or └ or ─
    if (/^\s*[│├└─]/.test(line)) {
      treeLines.push({ index: i + 1, text: line });
    }
  }
}

// Now we parse the tree lines
const pathStack = [];

console.log('=== VERIFYING EACH DOCUMENTED PATH ===\n');

let errorCount = 0;
let successCount = 0;

for (let item of treeLines) {
  const line = item.text;
  const lineNum = item.index;

  // Split line into tree structure and the filename/description
  const match = line.match(/^([\s│├└─├──└──]*)(.*)$/);
  if (!match) continue;

  const prefix = match[1];
  const remaining = match[2].trim();

  if (!remaining) continue;

  // Description is usually after '#' or space space
  let name = remaining;
  let description = '';
  const commentIdx = remaining.indexOf('#');
  if (commentIdx !== -1) {
    name = remaining.substring(0, commentIdx).trim();
    description = remaining.substring(commentIdx + 1).trim();
  } else {
    // Maybe split by double spaces
    const parts = remaining.split(/\s{2,}/);
    name = parts[0].trim();
    description = parts.slice(1).join(' ').trim();
  }

  // Calculate depth based on prefix length.
  // Each depth level is usually 4 characters: "│   " or "├── " or "    " or "└── "
  const depth = Math.floor(prefix.length / 4);

  // If name is a visual separator/virtual node
  const isVirtualNode = (
    name === 'Configuration & Build Files' ||
    name === 'assets/' && description.includes('Static Application Resources') && depth === 1 && pathStack[0] === 'rtx5-app'
  );

  // Clean name of trailing slashes or symbols
  let cleanName = name;
  if (cleanName.endsWith('/')) {
    cleanName = cleanName.slice(0, -1);
  }

  // Update pathStack based on depth
  pathStack[depth] = cleanName;
  pathStack.length = depth + 1;

  // If this is a virtual node, we don't treat it as a real path segment for children,
  // but let's see how the children are aligned.
  // Actually, let's build the full path by filtering out virtual nodes and empty segments.
  const activeSegments = [];
  for (let i = 0; i <= depth; i++) {
    const seg = pathStack[i];
    if (seg && seg !== 'Configuration & Build Files') {
      activeSegments.push(seg);
    }
  }

  const relativePath = activeSegments.join('/');
  const fullPath = path.join(rootDir, relativePath);

  // Skip validation of the root directory itself or virtual nodes
  if (!relativePath || name === 'Configuration & Build Files') {
    continue;
  }

  const exists = fs.existsSync(fullPath);
  if (exists) {
    successCount++;
  } else {
    // Sometimes there are slight variations in names/extensions or visual groups.
    // Let's check if there is an issue with case-sensitivity or something else
    errorCount++;
    console.log(`❌ Missing (Line ${lineNum}): "${name}"`);
    console.log(`   Expected relative path: ${relativePath}`);
    console.log(`   Absolute path checked: ${fullPath}\n`);
  }
}

console.log(`Verification Complete:`);
console.log(`- Valid paths found: ${successCount}`);
console.log(`- Invalid/Missing paths found: ${errorCount}`);
