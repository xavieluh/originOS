import { expect } from "@playwright/test";
import { E2E } from "../env";

interface MailpitSearch {
  messages?: { ID: string }[];
}

/** Waits for the newest email to `to` whose subject contains `subject` (Mailpit API) and returns its text. */
export async function waitForMail(to: string, subject: string): Promise<string> {
  const query = encodeURIComponent(`to:"${to}" subject:"${subject}"`);
  let text = "";
  await expect
    .poll(
      async () => {
        const search = (await (
          await fetch(`${E2E.mailpitUrl}/api/v1/search?query=${query}`)
        ).json()) as MailpitSearch;
        const id = search.messages?.[0]?.ID;
        if (!id) return false;
        const message = (await (await fetch(`${E2E.mailpitUrl}/api/v1/message/${id}`)).json()) as {
          Text: string;
        };
        text = message.Text;
        return true;
      },
      { timeout: 15_000, message: `email "${subject}" to ${to}` },
    )
    .toBe(true);
  return text;
}

/** The first link in an email's text body. */
export function firstLink(text: string): string {
  const match = text.match(/https?:\/\/\S+/);
  if (!match) throw new Error("email has no link");
  return match[0];
}

export const uniqueEmail = (name: string) =>
  `${name}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.test`;
