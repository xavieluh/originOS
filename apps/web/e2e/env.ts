/** Where the E2E stack runs. Defaults match compose.yaml and .env.example (local-only credentials). */
const apiPort = 4990;
const webPort = 3100;

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
  ownerState: "e2e/.auth/owner.json",
  ownerName: "Ada Example",
  ownerOrganization: "Example Lab",
  password: "correct horse battery staple",
} as const;
