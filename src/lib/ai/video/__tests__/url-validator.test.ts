import { describe, it, expect } from "vitest";
import { isAllowedVideoUri } from "../url-validator";

describe("url-validator", () => {
  it("allows blob URLs and video data URIs for client offline playback", () => {
    expect(isAllowedVideoUri("blob:http://localhost:3000/1234-uuid")).toBe(
      true,
    );
    expect(
      isAllowedVideoUri("blob:https://app.codebasevisualizer.dev/abc-def"),
    ).toBe(true);
    expect(
      isAllowedVideoUri("data:video/webm;base64,GkXfo59ChoEBQveBAULygQ=="),
    ).toBe(true);
    expect(
      isAllowedVideoUri("data:video/mp4;base64,AAAAHGZ0eXBtcDQyAAAAAA=="),
    ).toBe(true);
  });

  it("allows official Scrimba CDN HTTPS origins", () => {
    expect(isAllowedVideoUri("https://scrimba.com/explainers/abc.mp4")).toBe(
      true,
    );
    expect(isAllowedVideoUri("https://api.scrimba.com/videos/12345.webm")).toBe(
      true,
    );
    expect(
      isAllowedVideoUri("https://cdn.scrimba.com/renders/walkthrough.mp4"),
    ).toBe(true);
    expect(
      isAllowedVideoUri("https://assets.scrimba.com/static/vid.webm"),
    ).toBe(true);
  });

  it("rejects untrusted origins, insecure protocols, and malicious scripts", () => {
    expect(isAllowedVideoUri("http://cdn.scrimba.com/insecure.mp4")).toBe(
      false,
    );
    expect(isAllowedVideoUri("javascript:alert(1)")).toBe(false);
    expect(isAllowedVideoUri("data:text/html,<script>alert(1)</script>")).toBe(
      false,
    );
    expect(isAllowedVideoUri("https://evil-tracking-site.com/video.mp4")).toBe(
      false,
    );
    expect(isAllowedVideoUri("")).toBe(false);
    expect(isAllowedVideoUri(null)).toBe(false);
    expect(isAllowedVideoUri(undefined)).toBe(false);
  });
});
