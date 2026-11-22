import type { MailMessage } from "./mailer.js";

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

function message(
  to: string,
  subject: string,
  lines: string[],
  action: { label: string; url: string },
): MailMessage {
  const text = [
    ...lines,
    "",
    `${action.label}: ${action.url}`,
    "",
    "If you did not expect this email, you can ignore it.",
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1b1a17">
${lines.map((l) => `<p>${escape(l)}</p>`).join("\n")}
<p><a href="${escape(action.url)}" style="display:inline-block;padding:10px 16px;background:#0e5c56;color:#fff;border-radius:8px;text-decoration:none">${escape(action.label)}</a></p>
<p style="color:#57534b;font-size:13px">If you did not expect this email, you can ignore it.</p>
</body></html>`;
  return { to, subject, text, html };
}

export const verifyEmailMessage = (to: string, url: string) =>
  message(
    to,
    "Verify your email for OriginOS",
    [
      "Confirm this email address to finish creating your OriginOS account.",
      "The link expires in 1 hour.",
    ],
    {
      label: "Verify email",
      url,
    },
  );

export const resetPasswordMessage = (to: string, url: string) =>
  message(
    to,
    "Reset your OriginOS password",
    [
      "Someone asked to reset the password for this OriginOS account.",
      "The link expires in 1 hour. Resetting signs you out everywhere.",
    ],
    {
      label: "Choose a new password",
      url,
    },
  );

export const invitationMessage = (
  to: string,
  url: string,
  inviterName: string,
  organizationName: string,
  role: string,
  expiresAt: Date,
) =>
  message(
    to,
    `${inviterName} invited you to ${organizationName} on OriginOS`,
    [
      `${inviterName} invited you to join ${organizationName} on OriginOS as ${role === "admin" ? "an admin" : "a member"}.`,
      `Sign in or create an account with this email address (${to}) to accept. The invitation expires on ${expiresAt.toISOString().slice(0, 10)}.`,
    ],
    { label: "Review invitation", url },
  );
