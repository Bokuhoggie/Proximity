// Wrapper around electron-builder that pulls GH_TOKEN (and any other
// release-time env vars) from .env so `npm run release` works without
// having to remember to setx / $env: every session.
//
// .env is gitignored. The token never enters the repo.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

loadEnvFile(path.join(__dirname, '..', '.env'));

if (!process.env.GH_TOKEN) {
    console.error('[release] GH_TOKEN not found.');
    console.error('[release] Add it to .env at the repo root:');
    console.error('[release]   GH_TOKEN=github_pat_...');
    console.error('[release] Or set it in your shell with $env:GH_TOKEN.');
    process.exit(1);
}

console.log(`[release] GH_TOKEN loaded (length ${process.env.GH_TOKEN.length}). Building…`);

// Forward any extra args after `npm run release --` to electron-builder.
const args = ['electron-builder', '--win', '--publish', 'always', ...process.argv.slice(2)];
const child = spawn('npx', args, {
    stdio: 'inherit',
    env: process.env,
    shell: true
});

child.on('exit', (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
});

// Minimal .env loader. Same shape as scripts/backup.js — duplicated rather
// than shared to keep both scripts standalone (no extra files to copy on
// TIMONE if someone wants to run only one of them).
function loadEnvFile(file) {
    if (!fs.existsSync(file)) return;
    const content = fs.readFileSync(file, 'utf8');
    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq < 1) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        process.env[key] = val;
    }
}
