// Build only the files needed by the public website.
"use strict";
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const pages = ['index.html', 'schedule.html', 'stats.html', 'patches.html', 'picks.html', 'teams.html', 'team.html'];

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const page of pages) fs.copyFileSync(path.join(root, page), path.join(output, page));
for (const directory of ['assets', 'data']) {
    fs.cpSync(path.join(root, directory), path.join(output, directory), {
        recursive: true,
        filter: file => !path.basename(file).startsWith('.')
    });
}
console.log('Public website ready in dist/ (' + pages.length + ' pages, assets and data).');
