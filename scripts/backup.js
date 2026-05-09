// Proximity backup poller.
// Runs on TIMONE. Pulls a state snapshot from the signaling server every
// BACKUP_INTERVAL_SEC and writes a timestamped JSON file under BACKUP_DIR.
// Keeps the most recent BACKUP_KEEP files; older ones are pruned.
//
// Required env (or .env):
//   BACKUP_SERVER_URL   e.g. https://proximityserver-production.up.railway.app
//   BACKUP_TOKEN        same secret you set on the server
//
// Optional env:
//   BACKUP_INTERVAL_SEC default 300 (5 min)
//   BACKUP_DIR          default ./backups (relative to repo root)
//   BACKUP_KEEP         default 200 (~17h at 5-min interval)
//
// Run: node scripts/backup.js
// Stop with Ctrl+C. Use start-backup.bat to autostart on Windows.

const fs = require('fs');
const path = require('path');

// Pull .env into process.env without a dotenv dep.
loadEnvFile(path.join(__dirname, '..', '.env'));

const SERVER_URL = (process.env.BACKUP_SERVER_URL || '').replace(/\/$/, '');
const TOKEN = process.env.BACKUP_TOKEN;
const INTERVAL_SEC = parseInt(process.env.BACKUP_INTERVAL_SEC || '300', 10);
const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups'));
const KEEP = parseInt(process.env.BACKUP_KEEP || '200', 10);

if (!SERVER_URL || !TOKEN) {
    console.error('[backup] BACKUP_SERVER_URL and BACKUP_TOKEN are required.');
    console.error('[backup] Set them in .env or env, then re-run.');
    process.exit(1);
}

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

console.log(`[backup] server=${SERVER_URL} interval=${INTERVAL_SEC}s dir=${BACKUP_DIR} keep=${KEEP}`);

async function pullOnce() {
    const url = SERVER_URL + '/export';
    try {
        const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
        if (!r.ok) {
            const body = await r.text().catch(() => '');
            console.error(`[backup] ${ts()} HTTP ${r.status}: ${body.slice(0, 200)}`);
            return;
        }
        const json = await r.json();
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const file = path.join(BACKUP_DIR, `state-${stamp}.json`);
        fs.writeFileSync(file, JSON.stringify(json, null, 2));
        const counts = summarize(json);
        console.log(`[backup] ${stamp} wrote ${path.basename(file)} (${counts})`);
        prune();
    } catch (err) {
        console.error(`[backup] ${ts()} failed: ${err.message}`);
    }
}

function summarize(snap) {
    let messages = 0;
    for (const c of snap.textChannels || []) messages += (c.messages || []).length;
    return `${snap.profiles?.length || 0} profiles, ${snap.textChannels?.length || 0} text, ${snap.voiceChannels?.length || 0} voice, ${messages} messages`;
}

function prune() {
    try {
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('state-') && f.endsWith('.json'))
            .map(f => ({ f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime);
        const stale = files.slice(KEEP);
        for (const { f } of stale) fs.unlinkSync(path.join(BACKUP_DIR, f));
        if (stale.length) console.log(`[backup] pruned ${stale.length} old snapshot(s)`);
    } catch (err) {
        console.error('[backup] prune failed:', err.message);
    }
}

function ts() {
    return new Date().toISOString();
}

// Minimal .env loader. Tolerates KEY=VALUE, ignores blank lines and #-comments.
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
        if (!(key in process.env)) process.env[key] = val;
    }
}

// First pull immediately, then every INTERVAL_SEC.
pullOnce();
setInterval(pullOnce, INTERVAL_SEC * 1000);

process.on('SIGINT', () => {
    console.log('[backup] stopping');
    process.exit(0);
});
