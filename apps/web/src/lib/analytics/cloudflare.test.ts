import { describe, expect, it } from "vitest";
import { cloudflareBeaconTag } from "./cloudflare";

const TOKEN = "57ac47dbadc8470686378ac888fb7821";

describe("cloudflareBeaconTag", () => {
  it("emits the beacon for a real token", () => {
    const tag = cloudflareBeaconTag(TOKEN);
    expect(tag).toContain("https://static.cloudflareinsights.com/beacon.min.js");
    expect(tag).toContain(`{"token": "${TOKEN}"}`);
  });

  it("emits nothing on a stage that sets no token", () => {
    expect(cloudflareBeaconTag(undefined)).toBe("");
    expect(cloudflareBeaconTag("")).toBe("");
    expect(cloudflareBeaconTag("   ")).toBe("");
  });

  /** The tag is built by string concatenation, so a token is only ever hex. */
  it("emits nothing for a token that could break out of the attribute", () => {
    expect(cloudflareBeaconTag(`${TOKEN}"></script><script>alert(1)</script>`)).toBe("");
    expect(cloudflareBeaconTag("not-a-token")).toBe("");
    expect(cloudflareBeaconTag(TOKEN.slice(0, 31))).toBe("");
  });
});
