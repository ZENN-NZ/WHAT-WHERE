# Stage 04: Selective Client-Side Vault Encryption

## Inputs
| Layer | Source Path | Description |
| :--- | :--- | :--- |
| Layer 0 (Identity) | `../WORKSPACE.md` | Project identity and Vault invariant |
| Layer 3 (Reference) | `../_config/security_policy.md` | PBKDF2 600k + AES-256-GCM DEK wrapping & plaintext null invariant |
| Layer 3 (Reference) | `../ARCHITECTURE.md` | Section 6 Vault encryption flow |
| Layer 4 (Working) | `../03_collaborative_editor/output/stage_report.md` | CollaborativeEditor and document save flow |

## Process
1. Implement `src/lib/crypto/vault.ts` using Web Crypto API (`PBKDF2` 600,000 iterations SHA-256 KEK derivation, random 256-bit `AES-GCM` DEK generation, `wrapKey`/`unwrapKey`, fresh 12-byte IV per save, verifier token creation/verification).
2. Implement Vault session provider (in-memory non-serializable KEK with 15-minute inactivity auto-lock and manual lock) and server actions to persist `profiles.vault_salt`/`vault_verifier` and atomic Vault lock/save updates.
3. Build `src/components/editor/VaultLockGuard.tsx` and document header "Lock in Vault" / "Unlock" controls, ensuring plaintext (`yjs_state`, `content_json`, `plain_text`) is nulled and prior unencrypted `document_versions` / `document_backlinks` are purged when locking.

## Outputs
- `output/stage_report.md`: Implemented file inventory, crypto unit test results, and Verification Gate 4 checklist.
- Application files (`src/lib/crypto/vault.ts`, `src/components/editor/VaultLockGuard.tsx`, Vault integration in editor/search/actions).
- Review Gate: Web Crypto round-trip encryption/decryption & wrong-passphrase rejection verified; locking clears plaintext columns and purges unencrypted versions/backlinks.
