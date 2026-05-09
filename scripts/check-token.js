// Quick GH_TOKEN sanity check. Loads .env, hits the same GitHub endpoint
// electron-builder uses (GET /repos/Bokuhoggie/Proximity), prints what
// happened. Use this to debug 401s before kicking off a full release.

const fs = require('fs');
const path = require('path');

loadEnvFile(path.join(__dirname, '..', '.env'));

const token = process.env.GH_TOKEN;
if (!token) {
    console.error('GH_TOKEN not set in env or .env');
    process.exit(1);
}

console.log(`Token length: ${token.length}`);
console.log(`Token prefix: ${token.slice(0, 12)}...`);

const ENDPOINT = 'https://api.github.com/repos/Bokuhoggie/Proximity';

(async () => {
    try {
        const r = await fetch(ENDPOINT, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'User-Agent': 'proximity-token-check'
            }
        });
        const body = await r.text();
        console.log(`Status: ${r.status} ${r.statusText}`);
        if (r.ok) {
            const j = JSON.parse(body);
            console.log(`OK — repo: ${j.full_name} (private: ${j.private})`);
            console.log('Token works for reading. To verify write access, run npm run release.');
        } else {
            console.error(`Body: ${body.slice(0, 400)}`);
            if (r.status === 401) {
                console.error('\n→ Token is invalid/expired/revoked. Regenerate.');
            } else if (r.status === 403) {
                console.error('\n→ Token works but lacks repo access. Check fine-grained PAT scope:');
                console.error('  - Resource owner = Bokuhoggie');
                console.error('  - Selected repository = Bokuhoggie/Proximity');
                console.error('  - Contents: Read and write');
            } else if (r.status === 404) {
                console.error('\n→ Token has no access to this specific repo, or the repo path is wrong.');
            }
        }
    } catch (err) {
        console.error('Network error:', err.message);
    }
})();

function loadEnvFile(file) {
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq < 1) continue;
        const k = t.slice(0, eq).trim();
        let v = t.slice(eq + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (!(k in process.env)) process.env[k] = v;
    }
}
