/** Where the E2E stack runs. Defaults match compose.yaml and .env.example (local-only credentials). */
const apiPort = 4990;
const webPort = 3100;
const workerPort = 4991;

export const E2E = {
  apiPort,
  webPort,
  apiUrl: `http://127.0.0.1:${apiPort}`,
  webUrl: `http://localhost:${webPort}`,
  databaseUrl:
    process.env.E2E_DATABASE_URL ??
    process.env.TEST_DATABASE_URL ??
    "postgres://originos:originos-local-only@127.0.0.1:5432/originos_test",
  smtpUrl: process.env.E2E_SMTP_URL ?? "smtp://127.0.0.1:1025",
  mailpitUrl: process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:8025",
  workerPort,
  workerUrl: `http://127.0.0.1:${workerPort}`,
  // Object storage (SeaweedFS) and the malware scanner (ClamAV), Phase 07.
  s3Endpoint: process.env.E2E_S3_ENDPOINT ?? "http://127.0.0.1:8333",
  clamavHost: process.env.E2E_CLAMAV_HOST ?? "127.0.0.1",
  /** Lowered so the size refusal can be tested without a 25 MB file. */
  uploadMaxBytes: 1024 * 1024,
  ownerState: "e2e/.auth/owner.json",
  ownerName: "Ada Example",
  ownerOrganization: "Example Lab",
  password: "correct horse battery staple",
} as const;
