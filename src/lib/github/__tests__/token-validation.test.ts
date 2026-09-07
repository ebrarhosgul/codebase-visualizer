import { describe, it, expect } from "vitest";
import {
  GITHUB_PAT_COOKIE_NAME,
  validateGithubTokenFormat,
  maskGithubToken,
} from "../token-validation";

describe("GitHub token validation logic", () => {
  it("exports the standard cookie name (covers: AC-5)", () => {
    expect(GITHUB_PAT_COOKIE_NAME).toBe("github_pat");
  });

  describe("validateGithubTokenFormat", () => {
    it("accepts valid classic personal access tokens (covers: AC-5)", () => {
      expect(validateGithubTokenFormat("ghp_12345678901234567890")).toBe(true);
      expect(
        validateGithubTokenFormat("ghp_abcdefghijklmnopqrstuvwxyz012345"),
      ).toBe(true);
    });

    it("accepts valid fine grained personal access tokens (covers: AC-5)", () => {
      expect(
        validateGithubTokenFormat("github_pat_1234567890123456789012345"),
      ).toBe(true);
      expect(
        validateGithubTokenFormat(
          "github_pat_abcdefghijklmnopqrstuvwxyz012345",
        ),
      ).toBe(true);
    });

    it("trims surrounding whitespace before validating (covers: AC-5)", () => {
      expect(validateGithubTokenFormat("  ghp_12345678901234567890  ")).toBe(
        true,
      );
      expect(
        validateGithubTokenFormat("  github_pat_1234567890123456789012345  "),
      ).toBe(true);
    });

    it("rejects tokens that are too short for their prefix (covers: AC-5)", () => {
      expect(validateGithubTokenFormat("ghp_123456789012345")).toBe(false);
      expect(validateGithubTokenFormat("github_pat_1234567890")).toBe(false);
    });

    it("rejects tokens with invalid prefixes (covers: AC-5)", () => {
      expect(validateGithubTokenFormat("gho_12345678901234567890")).toBe(false);
      expect(validateGithubTokenFormat("pat_1234567890123456789012345")).toBe(
        false,
      );
      expect(validateGithubTokenFormat("Bearer 12345678901234567890")).toBe(
        false,
      );
    });

    it("rejects empty, non string, or whitespace only values (covers: AC-5)", () => {
      expect(validateGithubTokenFormat("")).toBe(false);
      expect(validateGithubTokenFormat("   ")).toBe(false);
      // @ts-expect-error test non string input
      expect(validateGithubTokenFormat(null)).toBe(false);
      // @ts-expect-error test non string input
      expect(validateGithubTokenFormat(undefined)).toBe(false);
      // @ts-expect-error test non string input
      expect(validateGithubTokenFormat(12345)).toBe(false);
    });
  });

  describe("maskGithubToken", () => {
    it("masks classic token preserving prefix and last 4 characters (covers: AC-5)", () => {
      expect(maskGithubToken("ghp_1234567890abcdef")).toBe("ghp_...cdef");
      expect(maskGithubToken("ghp_verylongsecrettoken9999")).toBe(
        "ghp_...9999",
      );
    });

    it("masks fine grained token preserving prefix and last 4 characters (covers: AC-5)", () => {
      expect(maskGithubToken("github_pat_1234567890abcdef")).toBe(
        "github_pat_...cdef",
      );
    });

    it("masks unrecognized format tokens safely preserving only trailing characters (covers: AC-5)", () => {
      expect(maskGithubToken("customtoken1234")).toBe("...1234");
    });

    it("handles trimmed tokens when masking (covers: AC-5)", () => {
      expect(maskGithubToken("  ghp_1234567890abcdef  ")).toBe("ghp_...cdef");
    });
  });
});
