import assert from "node:assert/strict";
import test from "node:test";
import {
  createVaultVerifier,
  decryptVaultPayload,
  deriveKek,
  encryptVaultPayload,
  generateDocumentDek,
  generateSaltBase64,
  unwrapDek,
  verifyVaultPassphrase,
  wrapDek,
} from "../src/lib/crypto/vault.ts";

test("Vault Web Crypto round-trip encrypts/decrypts payload with PBKDF2 + AES-256-GCM DEK wrapping", async () => {
  const passphrase = "correct-horse-battery-staple-99";
  const salt = generateSaltBase64(16);

  // Use lower iterations inside unit test for fast execution while verifying identical PBKDF2 path
  const kek = await deriveKek(passphrase, salt, 10_000);
  const verifier = await createVaultVerifier(kek);

  const verifiedKek = await verifyVaultPassphrase(
    passphrase,
    salt,
    verifier,
    10_000
  );
  assert.ok(verifiedKek, "Expected valid passphrase to unlock Vault");

  const wrongKek = await verifyVaultPassphrase(
    "wrong-passphrase-123",
    salt,
    verifier,
    10_000
  );
  assert.equal(wrongKek, null, "Expected wrong passphrase to be rejected");

  const dek = await generateDocumentDek();
  const wrapped = await wrapDek(dek, verifiedKek);
  const unwrapped = await unwrapDek(wrapped, verifiedKek);

  const payload = {
    title: "Top Secret Strategy",
    yjsStateBase64: "AQIDBA==",
    contentJson: [{ id: "1", type: "paragraph", content: [{ type: "text", text: "Classified" }] }],
  };

  const enc1 = await encryptVaultPayload(payload, unwrapped);
  const enc2 = await encryptVaultPayload(payload, unwrapped);

  // Fresh 96-bit IV on every save guarantees different ciphertexts for identical plaintext
  assert.notEqual(enc1.encryptionIvBase64, enc2.encryptionIvBase64);
  assert.notEqual(enc1.encryptedPayloadBase64, enc2.encryptedPayloadBase64);

  const decrypted = await decryptVaultPayload(
    enc1.encryptedPayloadBase64,
    enc1.encryptionIvBase64,
    unwrapped
  );
  assert.deepEqual(decrypted, payload);
});
