# Secrets policy

Applies to every contributor and every automated agent working on OriginOS (CLAUDE.md rule 5, THREAT_MODEL).

## What counts as a secret

Provider API keys (model providers, Slack, GitHub App, Stripe, publishing platforms), OAuth client secrets and tokens, database and object-storage credentials outside local development, webhook signing secrets, session and encryption keys, signing keys (ADR-006), ingest keys, personal access tokens, and any customer data.

## Rules

1. **Never commit a secret.** `.env` and `.env.*` are git-ignored; only `.env.example` is committed. `*.pem` and `*.key` are git-ignored.
2. **Local-only values are labeled.** The credentials in `compose.yaml`, `infra/local/` and `.env.example` contain `originos-local` in their value, bind to 127.0.0.1, and must never be reused elsewhere. They are the only allow-listed matches in `.gitleaks.toml`.
3. **Never log a secret.** Env validation errors name variables, not values. Structured logs redact credential headers (`authorization`, `cookie`, `x-api-key`, `x-ingest-key`, `set-cookie`) and credential-named fields at the top level and one level down (`packages/service-kit/src/logging.ts`). Readiness responses never include connection strings or driver error text. Tests cover each of these.
4. **Never send a secret to a model, the browser or telemetry.** Server-only env (for example `ORIGINOS_API_URL`) is read in server code; nothing is exposed with `NEXT_PUBLIC_`.
5. **Real secrets live in a secret manager**, injected as environment variables at runtime. The production store (cloud secret manager / KMS) is chosen in Phase 44; until then there are no production secrets.
6. **CI uses GitHub Actions secrets only**, never echoes them, and grants workflows read-only `contents` permission by default.

## Scanning

- **CI:** every push and pull request runs gitleaks 8.30.1 over the full git history (`.github/workflows/ci.yml`, job `secret-scan`). A finding fails the build.
- **Locally:** `scripts/check.sh` runs gitleaks when it is installed (`brew install gitleaks`, or a release binary from github.com/gitleaks/gitleaks), and always verifies that `.env` is git-ignored.

## If a secret is committed or leaked

1. Revoke or rotate it at the provider first. Deleting the commit does not make it safe; assume it is compromised.
2. Tell the owner. Do not rewrite shared git history without the owner's approval.
3. Record the incident and the rotation in the security log (Phase 41 adds the trust-operations runbook).
