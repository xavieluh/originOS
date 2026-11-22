import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  Button,
  CommandBar,
  DataTable,
  EventBadge,
  NotYetAvailable,
  PublicShell,
  StatusBadge,
  TextField,
  ThemeToggle,
  Timeline,
  WorkspaceShell,
  applyThemePreference,
  filterCommands,
  isActivePath,
  readThemePreference,
  themeInitScript,
} from "../src/index.js";

const noop = () => undefined;

describe("Button", () => {
  it("always renders a data-action", () => {
    const html = renderToStaticMarkup(
      <Button action="demo.save" onClick={noop}>
        Save
      </Button>,
    );
    expect(html).toContain('data-action="demo.save"');
    expect(html).toContain('type="button"');
  });

  it("renders a link when given href", () => {
    const html = renderToStaticMarkup(
      <Button action="demo.docs" href="/developers">
        Docs
      </Button>,
    );
    expect(html).toMatch(/^<a /);
    expect(html).toContain('href="/developers"');
  });

  it("shows the reason next to a disabled button", () => {
    const html = renderToStaticMarkup(
      <Button
        action="demo.publish"
        onClick={noop}
        disabled
        disabledReason="Publishing arrives in Phase 29."
      >
        Publish
      </Button>,
    );
    expect(html).toContain("disabled");
    expect(html).toContain('aria-describedby="reason-demo.publish"');
    expect(html).toContain("Publishing arrives in Phase 29.");
  });
});

describe("badges", () => {
  it("states the status in text", () => {
    const html = renderToStaticMarkup(<StatusBadge label="Unreachable" tone="negative" />);
    expect(html).toContain("Unreachable");
    expect(html).toContain('data-tone="negative"');
  });

  it("maps evidence basis to distinct tones", () => {
    const observed = renderToStaticMarkup(<EventBadge label="Observed" basis="observed" />);
    const declared = renderToStaticMarkup(<EventBadge label="Declared" basis="declared" />);
    expect(observed).toContain('data-tone="info"');
    expect(declared).toContain('data-tone="neutral"');
  });
});

describe("NotYetAvailable", () => {
  it("names the feature and phase and renders no controls", () => {
    const html = renderToStaticMarkup(<NotYetAvailable feature="Flight recorder" phase={19} />);
    expect(html).toContain("Not yet available · Phase 19");
    expect(html).toContain('data-not-yet-available="Flight recorder"');
    expect(html).not.toMatch(/<(button|a|input|select|textarea)\b/);
  });
});

describe("DataTable", () => {
  const columns = [{ key: "id", header: "ID", cell: (r: { id: string }) => r.id, mono: true }];
  it("renders a caption and scoped headers", () => {
    const html = renderToStaticMarkup(
      <DataTable
        caption="Runs"
        columns={columns}
        rows={[{ id: "run_1" }]}
        rowKey={(r) => r.id}
        empty={<p>none</p>}
      />,
    );
    expect(html).toContain("<caption");
    expect(html).toContain('scope="col"');
    expect(html).toContain("run_1");
  });
  it("renders the empty state instead of an empty table", () => {
    const html = renderToStaticMarkup(
      <DataTable
        caption="Runs"
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        empty={<p>No runs</p>}
      />,
    );
    expect(html).toBe("<p>No runs</p>");
  });
});

describe("TextField", () => {
  it("links description and error to the input", () => {
    const html = renderToStaticMarkup(
      <TextField id="handle" label="Handle" description="Public" error="Taken" />,
    );
    expect(html).toContain('for="handle"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="handle-description handle-error"');
  });
});

describe("Timeline", () => {
  it("renders machine-readable times", () => {
    const html = renderToStaticMarkup(
      <Timeline
        label="History"
        items={[{ id: "1", at: "2026-11-22T10:00:00Z", title: "Created" }]}
      />,
    );
    expect(html).toContain('<time dateTime="2026-11-22T10:00:00Z"');
    expect(html).toContain("2026-11-22 10:00:00 UTC");
  });
});

describe("shells", () => {
  it("workspace shell has a skip link, labelled nav and the current page marked", () => {
    const html = renderToStaticMarkup(
      <WorkspaceShell
        productName="OriginOS"
        surfaceLabel="Workspace"
        nav={[
          { href: "/home", label: "Home" },
          { href: "/agents", label: "Agents" },
        ]}
        currentPath="/agents/runs"
      >
        <p>content</p>
      </WorkspaceShell>,
    );
    expect(html).toContain('href="#main-content"');
    expect(html).toContain('<main id="main-content"');
    expect(html).toContain('aria-label="Workspace"');
    expect(html).toMatch(/href="\/agents"[^>]*aria-current="page"/);
    expect(html).toContain('data-action="nav.toggle"');
  });

  it("public shell renders site nav", () => {
    const html = renderToStaticMarkup(
      <PublicShell productName="OriginOS" nav={[{ href: "/developers", label: "Developers" }]}>
        <p>x</p>
      </PublicShell>,
    );
    expect(html).toContain('aria-label="Site"');
    expect(html).toContain('href="/developers"');
  });

  it("isActivePath matches sections but not prefixes of other words", () => {
    expect(isActivePath("/agents", "/agents")).toBe(true);
    expect(isActivePath("/agents/runs", "/agents")).toBe(true);
    expect(isActivePath("/agentsx", "/agents")).toBe(false);
    expect(isActivePath("/home", "/")).toBe(false);
  });
});

describe("command bar", () => {
  const items = [
    { id: "home", label: "Home", href: "/home", group: "Workspace" },
    {
      id: "agents",
      label: "Agents",
      href: "/agents",
      group: "Workspace",
      keywords: ["agenttrust", "runs"],
    },
    { id: "keys", label: "API keys", href: "/developers", group: "Developer console" },
  ];
  it("filters by label, group and keywords, all words required", () => {
    expect(filterCommands(items, "").map((i) => i.id)).toEqual(["home", "agents", "keys"]);
    expect(filterCommands(items, "trust").map((i) => i.id)).toEqual(["agents"]);
    expect(filterCommands(items, "developer api").map((i) => i.id)).toEqual(["keys"]);
    expect(filterCommands(items, "nothing")).toEqual([]);
  });
  it("renders an open button with an action and shortcut", () => {
    const html = renderToStaticMarkup(<CommandBar items={items} onNavigate={noop} />);
    expect(html).toContain('data-action="command-bar.open"');
    expect(html).toContain('aria-keyshortcuts="Meta+K Control+K"');
    expect(html).toContain('role="combobox"');
  });
});

describe("theme", () => {
  it("reads only known preferences and survives storage errors", () => {
    expect(readThemePreference({ getItem: () => "dark" })).toBe("dark");
    expect(readThemePreference({ getItem: () => "neon" })).toBe("system");
    expect(
      readThemePreference({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toBe("system");
    expect(readThemePreference(undefined)).toBe("system");
  });
  it("applies and clears the data-theme attribute", () => {
    const root = { dataset: {} as Record<string, string> } as unknown as HTMLElement;
    applyThemePreference(root, "dark");
    expect(root.dataset.theme).toBe("dark");
    applyThemePreference(root, "system");
    expect(root.dataset.theme).toBeUndefined();
  });
  it("init script only accepts light or dark", () => {
    expect(themeInitScript).toContain('t==="light"||t==="dark"');
  });
  it("toggle is a labelled radio group", () => {
    const html = renderToStaticMarkup(<ThemeToggle />);
    expect(html).toContain("<fieldset");
    expect(html).toContain("Colour theme");
    expect(html.match(/type="radio"/g)).toHaveLength(3);
  });
});
