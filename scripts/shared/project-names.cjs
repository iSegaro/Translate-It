const fs = require('node:fs');
const path = require('node:path');

function getProjectNames(packageName) {
  const words = packageName.split('-').map(word => word[0].toUpperCase() + word.slice(1));
  return {
    packageName,
    artifactPrefix: words.join('-'),
    displayName: words.join(' '),
  };
}

module.exports = { getProjectNames };

if (require.main === module) {
  const root = path.resolve(__dirname, '../..');
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const names = getProjectNames(packageJson.name);
  const value = process.argv[2] === 'display-name' ? names.displayName : names.artifactPrefix;
  process.stdout.write(value);
}
