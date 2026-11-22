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

## Authentication secrets (Phase 04)

| Variable | Used by | Production | Local value |
| --- | --- | --- | --- |
| `BETTER_AUTH_SECRET` | apps/api | **Required** (the API refuses to start without it). 32+ random characters, e.g. `openssl rand -base64 48`. Signs session cookies and encrypts TOTP secrets: rotating it signs everyone out and breaks enrolled two-step verification, so rotate deliberately. | `originos-local-only-…` in `.env.example`; the E2E suite uses its own `originos-local-only-e2e-…` value. Without it outside production the API generates a random secret per start and warns. |
| `SMTP_URL` | apps/api | Required for sign-up, password reset and invitations. Contains the SMTP provider's credentials (`smtps://user:password@host:465`); treat the whole URL as a secret. **BLOCKED:** no production email provider is chosen yet. | `smtp://127.0.0.1:1025` (Mailpit; nothing leaves the machine). |
| `DATABASE_URL` | apps/api, worker | Required. The connecting user must own the schema; the API switches every connection to the non-login `originos_app` role (ADR-023). | compose credentials (`originos-local-only`). |

Session tokens live only in an httpOnly cookie. Server code that lists sessions strips the tokens before anything reaches the browser (`apps/web/src/app/actions/account.ts`). Invitation tokens are stored only as SHA-256 hashes, travel in the URL fragment (never sent to servers) and then in POST bodies, and the API log redacts query strings.

## Scanning

- **CI:** every push and pull request runs gitleaks 8.30.1 over the full git history (`.github/workflows/ci.yml`, job `secret-scan`). A finding fails the build.
- **Locally:** `scripts/check.sh` runs gitleaks when it is installed (`brew install gitleaks`, or a release binary from github.com/gitleaks/gitleaks), and always verifies that `.env` is git-ignored.

## If a secret is committed or leaked

1. Revoke or rotate it at the provider first. Deleting the commit does not make it safe; assume it is compromised.
2. Tell the owner. Do not rewrite shared git history without the owner's approval.
3. Record the incident and the rotation in the security log (Phase 41 adds the trust-operations runbook).
