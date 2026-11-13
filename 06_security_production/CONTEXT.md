# Stage 06: Security Hardening, Audit Logs & Production Build Verification

## Inputs
| Layer | Source Path | Description |
| :--- | :--- | :--- |
| Layer 0 (Identity) | `../WORKSPACE.md` | Project identity |
| Layer 3 (Reference) | `../_config/security_policy.md` | CSP, HSTS, audit log events, cron authentication |
| Layer 4 (Working) | `../05_structured_databases/output/stage_report.md` | Complete application feature set |

## Process
1. Audit and verify `security_audit_logs` instrumentation across all Auth, Admin, and Vault actions (`OTP_REQUESTED`, `OTP_VERIFIED`, `UNAUTHORIZED_OTP_ATTEMPT`, `RATE_LIMIT_EXCEEDED`, `USER_INVITED`, `USER_REVOKED`, `VAULT_CONFIGURED`, `VAULT_LOCKED`, `VAULT_UNLOCKED`, `VAULT_UNLOCK_FAILED`).
2. Build `src/app/(workspace)/settings/security/page.tsx` exposing Vault passphrase setup/change, Security Audit Log viewer (admin-gated), and Phase 2 TOTP MFA (`aal2`) + WebAuthn Passkey (`prf`) blueprint readiness UI.
3. Implement `src/app/api/cron/keep-alive/route.ts` and `vercel.json` (`0 0 */3 * *` cron + hardened security headers).
4. Run full deterministic verification suite (`tsc --noEmit`, lint, unit tests, `next build`) and resolve any errors.

## Outputs
- `output/stage_report.md`: Final verification report with exact command outputs for typecheck, lint, tests, and production build.
- Application files (`src/app/(workspace)/settings/security/page.tsx`, `src/app/api/cron/keep-alive/route.ts`, `vercel.json`, `scripts/verify.mjs`).
- Review Gate: Zero TypeScript errors, zero lint errors, all unit tests pass, `next build` succeeds cleanly, and git history is cleanly pushed to `origin/main`.
