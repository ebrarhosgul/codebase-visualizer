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

    it("parses paths mapping with root alias @/* -> ./*", () => {
      const tsconfig = JSON.stringify({
        compilerOptions: {
          paths: {
            "@/*": ["./*"],
          },
        },
      });

      const aliases = extractPathAliases(tsconfig);
      expect(aliases["@/"]).toBe("");
    });

    it("handles tsconfig with trailing commas and comments", () => {
      const tsconfig = `{
        // comment
        "compilerOptions": {
          "baseUrl": ".",
          "paths": {
            "@/*": ["./*"],
          },
        },
      }`;

      const aliases = extractPathAliases(tsconfig);
      expect(aliases["@/"]).toBe("");
    });

    it("parses multiple fallback targets as an array", () => {
      const tsconfig = JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@/*": ["./src/*", "./*"],
          },
        },
      });

      const aliases = extractPathAliases(tsconfig);
      expect(aliases["@/"]).toEqual(["src/", ""]);
    });

    it("handles tsconfig content with Byte Order Mark BOM", () => {
      const tsconfig = `\uFEFF{
        "compilerOptions": {
          "paths": {
            "@/*": ["./*"]
          }
        }
      }`;

      const aliases = extractPathAliases(tsconfig);
      expect(aliases["@/"]).toBe("");
    });

    it("gracefully falls back to default aliases on malformed tsconfig syntax", () => {
      const brokenTsconfig = "{ compilerOptions: { paths: unparseable garbage";
      const aliases = extractPathAliases(brokenTsconfig);
      expect(aliases["@/"]).toBe("src/");
    });

    it("normalizes trailing slash on subdirectory path alias targets", () => {
      const tsconfig = JSON.stringify({
        compilerOptions: {
          paths: {
            "@components/*": ["./src/components"],
          },
        },
      });

      const aliases = extractPathAliases(tsconfig);
      expect(aliases["@components/"]).toBe("src/components/");
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

    it("resolves alias import via fallback targets in array", () => {
      const multiPathSet = new Set([
        "src/components/button.tsx",
        "lib/utils.ts",
      ]);

      const res = resolveModuleSpecifier(
        "@/utils",
        "src/components/button.tsx",
        { "@/": ["src/legacy/", "lib/"] },
        multiPathSet,
      );

      expect(res.isExternal).toBe(false);
      expect(res.resolvedPath).toBe("lib/utils.ts");
    });

    it("marks unscoped deep module import as external with base package name", () => {
      const res = resolveModuleSpecifier(
        "lodash/debounce",
        "src/index.ts",
        { "@/": "src/" },
        existingPaths,
      );

      expect(res.isExternal).toBe(true);
      expect(res.packageName).toBe("lodash");
    });

    it("resolves relative import with .js extension to .tsx file (TypeScript ESM)", () => {
      const res = resolveModuleSpecifier(
        "./button.js",
        "src/components/toolbar.tsx",
        { "@/": "src/" },
        existingPaths,
      );

      expect(res.isExternal).toBe(false);
      expect(res.resolvedPath).toBe("src/components/button.tsx");
    });

    it("resolves alias import to root directory when src folder does not exist", () => {
      const rootPaths = new Set(["components/button.tsx", "app/page.tsx"]);
      const res = resolveModuleSpecifier(
        "@/components/button",
        "app/page.tsx",
        { "@/": "src/" },
        rootPaths,
      );

      expect(res.isExternal).toBe(false);
      expect(res.resolvedPath).toBe("components/button.tsx");
    });

    it("resolves bare non-relative import to internal directory (baseUrl behavior)", () => {
      const barePaths = new Set(["components/button.tsx", "src/utils/math.ts"]);
      const resDirect = resolveModuleSpecifier(
        "components/button",
        "app/page.tsx",
        { "@/": "src/" },
        barePaths,
      );
      expect(resDirect.isExternal).toBe(false);
      expect(resDirect.resolvedPath).toBe("components/button.tsx");

      const resSrc = resolveModuleSpecifier(
        "utils/math",
        "src/components/button.tsx",
        { "@/": "src/" },
        barePaths,
      );
      expect(resSrc.isExternal).toBe(false);
      expect(resSrc.resolvedPath).toBe("src/utils/math.ts");
    });
  });
});
