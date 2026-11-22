import { describe, expect, it } from "vitest";
import { hasSessionCookie, isPrivatePath, safeNextPath } from "../src/lib/session-cookie";

describe("safeNextPath", () => {
  it("keeps same-site relative paths", () => {
    expect(safeNextPath("/settings/account?x=1")).toBe("/settings/account?x=1");
  });
  it.each([
    "https://evil.example/",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "",
    null,
    undefined,
  ])("rejects %s", (value) => {
    expect(safeNextPath(value)).toBe("/home");
  });
});

describe("isPrivatePath", () => {
  it("covers workspace, developer and onboarding pages, not look-alikes", () => {
    expect(isPrivatePath("/home")).toBe(true);
    expect(isPrivatePath("/settings/account")).toBe(true);
    expect(isPrivatePath("/developers")).toBe(true);
    expect(isPrivatePath("/onboarding")).toBe(true);
    expect(isPrivatePath("/homepage")).toBe(false);
    expect(isPrivatePath("/sign-in")).toBe(false);
    expect(isPrivatePath("/")).toBe(false);
  });
});

describe("hasSessionCookie", () => {
  it("finds the plain and __Secure- prefixed cookie only", () => {
    expect(hasSessionCookie("a=1; originos.session_token=x")).toBe(true);
    expect(hasSessionCookie("__Secure-originos.session_token=x")).toBe(true);
    expect(hasSessionCookie("originos.session_token_other=x")).toBe(false);
    expect(hasSessionCookie(null)).toBe(false);
  });
});
