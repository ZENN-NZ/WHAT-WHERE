export const VAULT_PBKDF2_ITERATIONS = 600_000;
export const VAULT_VERIFIER_PLAINTEXT = "WHAT-WHERE-VAULT-VERIFIED-V1";

export interface VaultDocumentPayload {
  title: string;
  yjsStateBase64: string;
  contentJson: unknown;
}

function getSubtleCrypto(): SubtleCrypto {
  if (typeof globalThis.crypto?.subtle === "undefined") {
    throw new Error("Web Crypto API (crypto.subtle) is unavailable.");
  }
  return globalThis.crypto.subtle;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function generateSaltBase64(byteLength = 16): string {
  const salt = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(salt);
  return bytesToBase64(salt);
}

export function generateIvBytes(byteLength = 12): Uint8Array {
  const iv = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(iv);
  return iv;
}

export async function deriveKek(
  passphrase: string,
  saltBase64: string,
  iterations = VAULT_PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  const enc = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const saltBytes = base64ToBytes(saltBase64);
  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(saltBytes),
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey", "encrypt", "decrypt"]
  );
}

export async function createVaultVerifier(kek: CryptoKey): Promise<string> {
  const subtle = getSubtleCrypto();
  const iv = generateIvBytes(12);
  const encoded = new TextEncoder().encode(VAULT_VERIFIER_PLAINTEXT);
  const cipherBuffer = await subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    kek,
    encoded
  );
  return JSON.stringify({
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(cipherBuffer)),
  });
}

export async function verifyVaultPassphrase(
  passphrase: string,
  saltBase64: string,
  verifierJson: string,
  iterations = VAULT_PBKDF2_ITERATIONS
): Promise<CryptoKey | null> {
  try {
    const parsed = JSON.parse(verifierJson) as { iv: string; ct: string };
    const kek = await deriveKek(passphrase, saltBase64, iterations);
    const subtle = getSubtleCrypto();
    const iv = base64ToBytes(parsed.iv);
    const ct = base64ToBytes(parsed.ct);
    const plainBuffer = await subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv) },
      kek,
      toArrayBuffer(ct)
    );
    const decoded = new TextDecoder().decode(plainBuffer);
    return decoded === VAULT_VERIFIER_PLAINTEXT ? kek : null;
  } catch {
    return null;
  }
}

export async function generateDocumentDek(): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  return subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function wrapDek(dek: CryptoKey, kek: CryptoKey): Promise<string> {
  const subtle = getSubtleCrypto();
  const wrapIv = generateIvBytes(12);
  const wrappedBuffer = await subtle.wrapKey("raw", dek, kek, {
    name: "AES-GCM",
    iv: toArrayBuffer(wrapIv),
  });
  return JSON.stringify({
    iv: bytesToBase64(wrapIv),
    key: bytesToBase64(new Uint8Array(wrappedBuffer)),
  });
}

export async function unwrapDek(
  wrappedDekJson: string,
  kek: CryptoKey
): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  const parsed = JSON.parse(wrappedDekJson) as { iv: string; key: string };
  const wrapIv = base64ToBytes(parsed.iv);
  const wrappedBytes = base64ToBytes(parsed.key);
  return subtle.unwrapKey(
    "raw",
    toArrayBuffer(wrappedBytes),
    kek,
    { name: "AES-GCM", iv: toArrayBuffer(wrapIv) },
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encryptVaultPayload(
  payload: VaultDocumentPayload,
  dek: CryptoKey
): Promise<{ encryptedPayloadBase64: string; encryptionIvBase64: string }> {
  const subtle = getSubtleCrypto();
  const iv = generateIvBytes(12);
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const cipherBuffer = await subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    dek,
    encoded
  );
  return {
    encryptedPayloadBase64: bytesToBase64(new Uint8Array(cipherBuffer)),
    encryptionIvBase64: bytesToBase64(iv),
  };
}

export async function decryptVaultPayload(
  encryptedPayloadBase64: string,
  encryptionIvBase64: string,
  dek: CryptoKey
): Promise<VaultDocumentPayload> {
  const subtle = getSubtleCrypto();
  const iv = base64ToBytes(encryptionIvBase64);
  const ciphertext = base64ToBytes(encryptedPayloadBase64);
  const plainBuffer = await subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    dek,
    toArrayBuffer(ciphertext)
  );
  const decoded = new TextDecoder().decode(plainBuffer);
  return JSON.parse(decoded) as VaultDocumentPayload;
}
