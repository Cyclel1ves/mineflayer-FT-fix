const fs = require('fs');
const path = require('path');

const candidates = [
    path.join(__dirname, '.updates', 'apply-library-patches.js'),
    path.join(__dirname, 'updates', 'apply-library-patches.js')
];

let loaded = false;

for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    require(candidate);
    loaded = true;
    break;
}

if (!loaded) {
    throw new Error(`Patch loader could not find apply-library-patches.js in any known folder: ${candidates.join(', ')}`);
}
