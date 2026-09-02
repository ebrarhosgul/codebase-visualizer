import { describe, it, expect } from "vitest";
import { parseGithubUrl } from "../url-parser";

describe("parseGithubUrl", () => {
  it("parses standard https GitHub URLs", () => {
    const result = parseGithubUrl("https://github.com/facebook/react");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.owner).toBe("facebook");
      expect(result.data.repo).toBe("react");
      expect(result.data.branch).toBeUndefined();
    }
  });

  it("parses URLs without protocol", () => {
    const result = parseGithubUrl("github.com/vercel/next.js");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.owner).toBe("vercel");
      expect(result.data.repo).toBe("next.js");
    }
  });

  it("strips trailing slashes and .git extensions", () => {
    const result = parseGithubUrl("https://github.com/torvalds/linux.git/");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.owner).toBe("torvalds");
      expect(result.data.repo).toBe("linux");
    }
  });

  it("extracts branch from /tree/ paths", () => {
    const result = parseGithubUrl(
      "https://github.com/owner/repo/tree/feat/walking-skeleton",
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.owner).toBe("owner");
      expect(result.data.repo).toBe("repo");
      expect(result.data.branch).toBe("feat/walking-skeleton");
    }
  });

  it("rejects non-GitHub domains with helpful error", () => {
    const result = parseGithubUrl("https://gitlab.com/owner/repo");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Only public GitHub repositories");
    }
  });

  it("rejects empty or whitespace inputs", () => {
    const result = parseGithubUrl("   ");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("INVALID_URL");
    }
  });

  it("rejects invalid repository or owner names", () => {
    const result = parseGithubUrl("github.com/-bad-owner/repo");
    expect(result.success).toBe(false);
  });
});
