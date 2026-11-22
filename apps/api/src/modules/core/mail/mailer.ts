import nodemailer, { type Transporter } from "nodemailer";

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/**
 * Outbound email. `configured` is false when no transport exists, and the UI
 * says so instead of pretending a message was sent.
 */
export interface Mailer {
  readonly configured: boolean;
  send(message: MailMessage): Promise<void>;
}

export class MailNotConfiguredError extends Error {
  constructor() {
    super("Email delivery is not configured (SMTP_URL is not set).");
  }
}

export class NotConfiguredMailer implements Mailer {
  readonly configured = false;
  async send(): Promise<void> {
    throw new MailNotConfiguredError();
  }
}

/** SMTP via nodemailer. Locally this is Mailpit from compose.yaml; in production, a provider's SMTP relay. */
export class SmtpMailer implements Mailer {
  readonly configured = true;
  private readonly transport: Transporter;

  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport(smtpUrl);
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}

/** Captures messages in memory. Tests only. */
export class MemoryMailer implements Mailer {
  readonly configured = true;
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
}

export function createMailer(env: { SMTP_URL?: string | undefined; MAIL_FROM: string }): Mailer {
  return env.SMTP_URL ? new SmtpMailer(env.SMTP_URL, env.MAIL_FROM) : new NotConfiguredMailer();
}
