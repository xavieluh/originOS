import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppShell, StatusBadge } from "../src/index.js";

describe("AppShell", () => {
  it("renders a skip link targeting the main landmark", () => {
    const html = renderToStaticMarkup(
      <AppShell productName="OriginOS" footer="f">
        <p>content</p>
      </AppShell>,
    );
    expect(html).toContain('href="#main-content"');
    expect(html).toContain('<main id="main-content"');
    expect(html).toContain("<header");
    expect(html).toContain("<footer");
  });

  it("renders no links other than the skip link", () => {
    const html = renderToStaticMarkup(
      <AppShell productName="OriginOS">
        <p>content</p>
      </AppShell>,
    );
    expect(html.match(/<a /g)).toHaveLength(1);
  });
});

describe("StatusBadge", () => {
  it("states the status in text", () => {
    const html = renderToStaticMarkup(<StatusBadge label="Unreachable" tone="negative" />);
    expect(html).toContain("Unreachable");
    expect(html).toContain('data-tone="negative"');
  });
});
