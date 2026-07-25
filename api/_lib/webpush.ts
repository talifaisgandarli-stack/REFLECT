/**
 * Edge-compatible Web Push sender — RFC 8291 (aes128gcm payload encryption) +
 * RFC 8292 (VAPID) implemented with the Web Crypto API only.
 *
 * The `web-push` npm library needs the Node.js runtime, which does not work in
 * this Vercel project (every deployed function is Edge; a Node function crashes
 * at bootstrap with FUNCTION_INVOCATION_FAILED). This module has zero Node
 * dependencies so /api/push/notify can run on the Edge runtime like the rest.
 */

const enc = new TextEncoder();

// TS 5.7 types Uint8Array as Uint8Array<ArrayBufferLike>, which no longer
// structurally matches BufferSource. Our bytes are always ArrayBuffer-backed, so
// cast at the Web Crypto / fetch boundary (same pattern as src/lib/push.ts).
const bs = (u: Uint8Array): BufferSource => u as BufferSource;

export type PushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export type VapidDetails = {
  subject: string; // mailto:… or an https URL
  publicKey: string; // base64url, 65-byte uncompressed P-256 point
  privateKey: string; // base64url, 32-byte P-256 scalar
};

export type SendResult = { ok: true } | { ok: false; statusCode: number; body: string };

function b64urlToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

/** ES256-signed VAPID JWT wrapped in the `vapid t=…, k=…` Authorization value. */
async function vapidAuthHeader(endpoint: string, vapid: VapidDetails): Promise<string> {
  const audience = new URL(endpoint).origin;
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = bytesToB64url(
    enc.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: vapid.subject,
      }),
    ),
  );
  const signingInput = `${header}.${payload}`;

  // Build a P-256 JWK from the raw VAPID keys (x,y from the public point; d = private scalar).
  const pub = b64urlToBytes(vapid.publicKey); // 0x04 || x(32) || y(32)
  const d = b64urlToBytes(vapid.privateKey);
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    d: bytesToB64url(d),
    ext: true,
  };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  // WebCrypto ECDSA returns the raw r||s signature (IEEE P1363) — exactly JWT ES256's format.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, bs(enc.encode(signingInput))));
  const jwt = `${signingInput}.${bytesToB64url(sig)}`;
  return `vapid t=${jwt}, k=${vapid.publicKey}`;
}

/** Encrypt `payload` for `subscription` as a single aes128gcm record (RFC 8291). */
async function encryptPayload(subscription: PushSubscription, payload: Uint8Array): Promise<Uint8Array> {
  const clientPub = b64urlToBytes(subscription.keys.p256dh); // 65 bytes
  const authSecret = b64urlToBytes(subscription.keys.auth); // 16 bytes

  // Ephemeral server ECDH key pair.
  const serverKeys = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const serverPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey)); // 65 bytes

  // ECDH shared secret between our ephemeral key and the client's public key.
  const clientPubKey = await crypto.subtle.importKey('raw', bs(clientPub), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhBits = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: clientPubKey }, serverKeys.privateKey, 256),
  );

  // Step 1: IKM = HKDF-Extract(auth, ecdh) → HKDF-Expand(key_info, 32).
  const ecdhKey = await crypto.subtle.importKey('raw', bs(ecdhBits), 'HKDF', false, ['deriveBits']);
  const keyInfo = concat(enc.encode('WebPush: info\0'), clientPub, serverPubRaw);
  const ikm = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: bs(authSecret), info: bs(keyInfo) }, ecdhKey, 256),
  );

  // Random content-encryption salt.
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Step 2: CEK (16 bytes) and NONCE (12 bytes) from the IKM under that salt.
  const ikmKey = await crypto.subtle.importKey('raw', bs(ikm), 'HKDF', false, ['deriveBits']);
  const cekBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: bs(salt), info: bs(enc.encode('Content-Encoding: aes128gcm\0')) },
    ikmKey,
    128,
  );
  const nonce = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: bs(salt), info: bs(enc.encode('Content-Encoding: nonce\0')) },
      ikmKey,
      96,
    ),
  );
  const cek = await crypto.subtle.importKey('raw', cekBits, { name: 'AES-GCM' }, false, ['encrypt']);

  // Single/last record: plaintext || 0x02 padding delimiter. AES-GCM appends the 16-byte tag.
  const record = concat(payload, new Uint8Array([0x02]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bs(nonce) }, cek, bs(record)));

  // aes128gcm header: salt(16) || rs(4, BE) || idlen(1) || keyid(server public, 65).
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  const header = concat(salt, rs, new Uint8Array([serverPubRaw.length]), serverPubRaw);
  return concat(header, ciphertext);
}

/** Encrypt + sign + POST one push. Never throws for HTTP errors — returns them. */
export async function sendWebPush(
  subscription: PushSubscription,
  payloadStr: string,
  vapid: VapidDetails,
  ttl = 86400,
): Promise<SendResult> {
  const body = await encryptPayload(subscription, enc.encode(payloadStr));
  const auth = await vapidAuthHeader(subscription.endpoint, vapid);
  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
    },
    body: bs(body) as BodyInit,
  });
  if (res.status >= 200 && res.status < 300) return { ok: true };
  const text = await res.text().catch(() => '');
  return { ok: false, statusCode: res.status, body: text };
}
