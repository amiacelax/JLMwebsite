const ITERATIONS = 100_000;
const SALT_BYTES = 16;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveBits(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  return crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
}

export async function hashPassword(
  password: string
): Promise<{ salt: string; hash: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const bits = new Uint8Array(await deriveBits(password, salt));
  return {
    salt: bytesToBase64(salt),
    hash: bytesToBase64(bits),
  };
}

export async function verifyPassword(
  password: string,
  saltBase64: string,
  hashBase64: string
): Promise<boolean> {
  const salt = base64ToBytes(saltBase64);
  const expected = base64ToBytes(hashBase64);
  const bits = new Uint8Array(await deriveBits(password, salt));
  if (bits.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ expected[i];
  return diff === 0;
}
