// End-to-end encryption helper.
//
// Threat model: keep Railway (or whoever hosts the signaling server)
// from being able to read the contents of text messages or image uploads.
// Voice already uses DTLS-SRTP; this fills the gap for text + images.
//
// Design:
//   - All friends share a server passphrase, entered once and persisted
//     in localStorage on each client.
//   - We derive a 256-bit AES-GCM key from the passphrase via PBKDF2
//     (200k iterations, fixed salt). The salt being public is fine —
//     the passphrase is the secret.
//   - Each ciphertext carries its own random 12-byte IV. Format on the
//     wire is `enc1:<base64(iv)>.<base64(ciphertext)>`. The "enc1:"
//     prefix lets receivers detect encrypted payloads vs plaintext, so
//     old/unconfigured clients still see *something* (a placeholder).
//   - For uploads: encrypt the file bytes, post the ciphertext, send
//     the IV + original mime in the chat-message metadata. Receivers
//     fetch the ciphertext, decrypt, render via blob URL.
//
// What this does NOT protect against:
//   - A friend leaking the passphrase
//   - Anyone who gets ahold of a friend's localStorage
//   - Forward secrecy / key rotation (would need per-message DH ratchet)
//   - Server tampering with channel structure / who-is-online (those
//     are necessarily clear, the server needs them to function)

const KEY_STORAGE = 'proximity-e2e-key-v1';
const SALT = new TextEncoder().encode('proximity-e2e-salt-v1');
const PREFIX = 'enc1:';
const PBKDF2_ITERATIONS = 200000;

let cachedKey = null;

export function hasKey() {
    return cachedKey !== null || localStorage.getItem(KEY_STORAGE) !== null;
}

// Set the passphrase, derive + cache the key, and persist it (the
// derived key, not the passphrase) for next launch. Returns true on
// success.
export async function setPassphrase(passphrase) {
    if (typeof passphrase !== 'string' || passphrase.length === 0) {
        throw new Error('passphrase required');
    }
    const key = await deriveKey(passphrase);
    cachedKey = key;
    // Persist as raw bytes so we don't have to re-derive on every launch.
    const raw = await crypto.subtle.exportKey('raw', key);
    localStorage.setItem(KEY_STORAGE, b64(new Uint8Array(raw)));
    return true;
}

export function clearKey() {
    cachedKey = null;
    localStorage.removeItem(KEY_STORAGE);
}

// Lazy-load the cached key (from memory, then localStorage).
async function getKey() {
    if (cachedKey) return cachedKey;
    const stored = localStorage.getItem(KEY_STORAGE);
    if (!stored) return null;
    const raw = b64decode(stored);
    cachedKey = await crypto.subtle.importKey(
        'raw', raw,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
    );
    return cachedKey;
}

async function deriveKey(passphrase) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
        'raw', enc.encode(passphrase),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: SALT, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}

// ---------- Text ----------

export async function encryptText(plain) {
    const key = await getKey();
    if (!key) throw new Error('No encryption key set');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(plain)
    );
    return `${PREFIX}${b64(iv)}.${b64(new Uint8Array(ct))}`;
}

// Returns the plaintext, or null if not encrypted (so callers fall back
// to displaying the raw input). Throws on tamper / wrong key.
export async function decryptText(payload) {
    if (typeof payload !== 'string' || !payload.startsWith(PREFIX)) return null;
    const key = await getKey();
    if (!key) throw new Error('Encrypted message but no key set');
    const body = payload.slice(PREFIX.length);
    const dot = body.indexOf('.');
    if (dot < 0) throw new Error('Malformed ciphertext');
    const iv = b64decode(body.slice(0, dot));
    const ct = b64decode(body.slice(dot + 1));
    const plainBuf = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ct
    );
    return new TextDecoder().decode(plainBuf);
}

// ---------- Binary (images) ----------

// Returns { ciphertext: ArrayBuffer, iv: Uint8Array }
export async function encryptBytes(bytes) {
    const key = await getKey();
    if (!key) throw new Error('No encryption key set');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
    return { ciphertext: ct, iv };
}

// Decrypts back into a Blob with the supplied mime.
export async function decryptBytes(ciphertext, ivBase64, mime) {
    const key = await getKey();
    if (!key) throw new Error('No encryption key set');
    const iv = b64decode(ivBase64);
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new Blob([plainBuf], { type: mime || 'application/octet-stream' });
}

// ---------- base64 helpers ----------

function b64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
}
function b64decode(str) {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

export const CRYPTO_PREFIX = PREFIX;
