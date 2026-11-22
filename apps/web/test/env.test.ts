import { describe, expect, it } from "vitest";
import { isGalleryEnabled, loadWebServerEnv } from "../src/lib/env";

describe("loadWebServerEnv", () => {
  it("defaults the API URL to loopback", () => {
    expect(loadWebServerEnv({}).ORIGINOS_API_URL).toBe("http://127.0.0.1:4000");
  });
  it("rejects a malformed API URL", () => {
    expect(() => loadWebServerEnv({ ORIGINOS_API_URL: "not a url" })).toThrow(/ORIGINOS_API_URL/);
  });
});

describe("isGalleryEnabled", () => {
  it("is on in development and test", () => {
    expect(isGalleryEnabled(loadWebServerEnv({ NODE_ENV: "development" }))).toBe(true);
    expect(isGalleryEnabled(loadWebServerEnv({ NODE_ENV: "test" }))).toBe(true);
  });
  it("is off in production unless explicitly enabled", () => {
    expect(isGalleryEnabled(loadWebServerEnv({ NODE_ENV: "production" }))).toBe(false);
    expect(
      isGalleryEnabled(
        loadWebServerEnv({ NODE_ENV: "production", ORIGINOS_ENABLE_GALLERY: "true" }),
      ),
    ).toBe(true);
  });
  it("rejects anything but true or false", () => {
    expect(() => loadWebServerEnv({ ORIGINOS_ENABLE_GALLERY: "yes" })).toThrow(
      /ORIGINOS_ENABLE_GALLERY/,
    );
  });
});
