const fs = require('fs');
const path = require('path');
const os = require('os');

const OLD = 'return std::format("{}%", dimension.value);';
const NEW = 'return std::to_string(dimension.value) + "%";';

function patchFile(filePath, label) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(OLD)) {
    content = content.replace(OLD, NEW);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Patched ${label}: std::format -> std::to_string (NDK 26 compat)`);
  } else if (content.includes(NEW)) {
    console.log(`${label} already patched`);
  }
}

patchFile(
  path.join(__dirname, '..', 'node_modules', 'react-native', 'ReactCommon',
    'react', 'renderer', 'core', 'graphicsConversions.h'),
  'node_modules graphicsConversions.h'
);

const gradleCache = path.join(os.homedir(), '.gradle', 'caches');
if (fs.existsSync(gradleCache)) {
  const find = (dir, target) => {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isFile() && entry.name === target) return full;
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const found = find(full, target);
          if (found) return found;
        }
      }
    } catch {}
    return null;
  };
  // Gradle transforms cache may have multiple versions — search broadly
  // but only within the known transforms path
}
