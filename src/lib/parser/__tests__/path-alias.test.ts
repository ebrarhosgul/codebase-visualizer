import { describe, it, expect } from "vitest";
import {
  extractPathAliases,
  normalizeRelativePath,
  resolveModuleSpecifier,
} from "../path-alias";

describe("path-alias", () => {
  describe("extractPathAliases", () => {
    it("returns default @/ mapping when no tsconfig is provided", () => {
      const aliases = extractPathAliases();
      expect(aliases["@/"]).toBe("src/");
    });

    it("parses paths mapping from tsconfig json content", () => {
      const tsconfig = JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@/*": ["./src/*"],
            "~/*": ["./app/*"],
          },
        },
      });

      const aliases = extractPathAliases(tsconfig);
      expect(aliases["@/"]).toBe("src/");
      expect(aliases["~/"]).toBe("app/");
    });
  });

  describe("normalizeRelativePath", () => {
    it("handles simple relative paths", () => {
      expect(normalizeRelativePath("src/components", "./button")).toBe(
        "src/components/button",
      );
    });

    it("resolves parent directory segments", () => {
      expect(normalizeRelativePath("src/components/ui", "../utils")).toBe(
        "src/components/utils",
      );
    });
  });

  describe("resolveModuleSpecifier", () => {
    const existingPaths = new Set([
      "src/index.ts",
      "src/components/button.tsx",
      "src/utils/math.ts",
    ]);

    it("resolves relative import to existing file", () => {
      const res = resolveModuleSpecifier(
        "./button",
        "src/components/toolbar.tsx",
        { "@/": "src/" },
        existingPaths,
      );

      expect(res.isExternal).toBe(false);
      expect(res.resolvedPath).toBe("src/components/button.tsx");
    });

    it("resolves alias import to existing file", () => {
      const res = resolveModuleSpecifier(
        "@/utils/math",
        "src/index.ts",
        { "@/": "src/" },
        existingPaths,
      );

      expect(res.isExternal).toBe(false);
      expect(res.resolvedPath).toBe("src/utils/math.ts");
    });

    it("marks external third party packages as external", () => {
      const res = resolveModuleSpecifier(
        "react",
        "src/index.ts",
        { "@/": "src/" },
        existingPaths,
      );

      expect(res.isExternal).toBe(true);
      expect(res.packageName).toBe("react");
    });

    it("marks scoped third party packages as external with package scope", () => {
      const res = resolveModuleSpecifier(
        "@xyflow/react",
        "src/index.ts",
        { "@/": "src/" },
        existingPaths,
      );

      expect(res.isExternal).toBe(true);
      expect(res.packageName).toBe("@xyflow/react");
    });
  });
});
