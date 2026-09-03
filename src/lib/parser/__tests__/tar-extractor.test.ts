import { describe, it, expect } from "vitest";
import { gzipSync } from "node:zlib";
import tar from "tar-stream";
import {
  calculateFileDepthScore,
  stripTarballRootFolder,
  unpackRepositoryTarball,
} from "../tar-extractor";

describe("tar-extractor", () => {
  it("calculates file depth scores prioritizing root and src/", () => {
    expect(calculateFileDepthScore("index.ts")).toBe(0);
    expect(calculateFileDepthScore("src/index.ts")).toBe(1);
    expect(calculateFileDepthScore("src/components/button.tsx")).toBe(2);
    expect(calculateFileDepthScore("scripts/build.ts")).toBe(1.5);
  });

  it("strips tarball root directory name", () => {
    expect(stripTarballRootFolder("owner-repo-1234abc/src/main.ts")).toBe(
      "src/main.ts",
    );
    expect(stripTarballRootFolder("owner-repo-1234abc")).toBe("");
  });

  it("unpacks tarball in memory and extracts source files and tsconfig", async () => {
    const pack = tar.pack();

    pack.entry(
      { name: "test-repo-abc123/tsconfig.json" },
      JSON.stringify({ compilerOptions: { baseUrl: "." } }),
    );

    pack.entry(
      { name: "test-repo-abc123/src/index.ts" },
      'console.log("hello world");',
    );

    pack.entry({ name: "test-repo-abc123/README.md" }, "# Readme");

    pack.finalize();

    // Collect packed buffer
    const chunks: Buffer[] = [];
    for await (const chunk of pack) {
      chunks.push(chunk as Buffer);
    }
    const tarBuffer = Buffer.concat(chunks);
    const gzippedBuffer = gzipSync(tarBuffer);

    const arrayBuffer = gzippedBuffer.buffer.slice(
      gzippedBuffer.byteOffset,
      gzippedBuffer.byteOffset + gzippedBuffer.byteLength,
    );

    const result = await unpackRepositoryTarball(arrayBuffer, 10);

    expect(result.tsconfigContent).toBeDefined();
    expect(result.files.length).toBe(1);
    expect(result.files[0]?.path).toBe("src/index.ts");
    expect(result.files[0]?.content).toBe('console.log("hello world");');
  });
});
