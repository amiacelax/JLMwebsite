/** Web Push (VAPID + aes128gcm) using Workers Web Crypto. */

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function b64urlToBytes(value: string): Uint8Array {
  const pad = "=".repeat((4 - (value.length % 4)) % 4);
  const b64 = (value + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64url(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8
  );
  return new Uint8Array(bits);
}

async function vapidJwt(endpoint: string, privateJwk: JsonWebKey, subject: string): Promise<string> {
  const header = bytesToB64url(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToB64url(
    utf8(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: subject,
      })
    )
  );
  const key = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, utf8(header + "." + payload))
  );
  return header + "." + payload + "." + bytesToB64url(sig);
}

async function encryptPayload(payload: string, uaPublic: Uint8Array, authSecret: Uint8Array): Promise<Uint8Array> {
  const local = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  )) as CryptoKeyPair;
  const localPublic = new Uint8Array((await crypto.subtle.exportKey("raw", local.publicKey)) as ArrayBuffer);
  const remote = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const derive: { name: string; public: CryptoKey } = { name: "ECDH", public: remote };
  const shared = new Uint8Array(
    (await crypto.subtle.deriveBits(
      derive as Parameters<SubtleCrypto["deriveBits"]>[0],
      local.privateKey,
      256
    )) as ArrayBuffer
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const ikm = await hkdf(
    authSecret,
    shared,
    concat([utf8("WebPush: info"), new Uint8Array([0]), uaPublic, localPublic]),
    32
  );
  const cek = await hkdf(salt, ikm, utf8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, utf8("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, concat([utf8(payload), new Uint8Array([2])]))
  );
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  return concat([salt, recordSize, new Uint8Array([localPublic.length]), localPublic, cipher]);
}

export async function sendWebPush(input: {
  subscription: PushSubscriptionKeys;
  message: string;
  vapidPublicKey: string;
  vapidPrivateJwk: JsonWebKey;
  subject: string;
}): Promise<"ok" | "gone" | "fail"> {
  const body = await encryptPayload(
    JSON.stringify({ message: input.message.slice(0, 180) }),
    b64urlToBytes(input.subscription.p256dh),
    b64urlToBytes(input.subscription.auth)
  );
  const jwt = await vapidJwt(input.subscription.endpoint, input.vapidPrivateJwk, input.subject);
  const res = await fetch(input.subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: "vapid t=" + jwt + ", k=" + input.vapidPublicKey,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "3600",
    },
    body,
  });
  if (res.status === 404 || res.status === 410) return "gone";
  if (res.ok) return "ok";
  return "fail";
}
