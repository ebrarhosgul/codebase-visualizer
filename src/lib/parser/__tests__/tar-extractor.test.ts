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

  it("invokes onProgress callback during unpacking (covers: AC-4)", async () => {
    const pack = tar.pack();

    pack.entry(
      { name: "test-repo-abc123/src/alpha.ts" },
      "export const a = 1;",
    );
    pack.entry({ name: "test-repo-abc123/src/beta.ts" }, "export const b = 2;");
    pack.finalize();

    const chunks: Buffer[] = [];
    for await (const chunk of pack) {
      chunks.push(chunk as Buffer);
    }
    const gzippedBuffer = gzipSync(Buffer.concat(chunks));
    const arrayBuffer = gzippedBuffer.buffer.slice(
      gzippedBuffer.byteOffset,
      gzippedBuffer.byteOffset + gzippedBuffer.byteLength,
    );

    const progressCalls: Array<{ count: number; path: string }> = [];
    const result = await unpackRepositoryTarball(arrayBuffer, {
      maxFiles: 10,
      onProgress: (count, currentPath) => {
        progressCalls.push({ count, path: currentPath });
      },
    });

    expect(result.files.length).toBe(2);
    expect(progressCalls.length).toBeGreaterThanOrEqual(2);
    expect(progressCalls[0]?.path).toContain("alpha.ts");
    expect(progressCalls[1]?.path).toContain("beta.ts");
  });

  it("extracts nested tsconfig when root tsconfig is absent", async () => {
    const pack = tar.pack();

    pack.entry(
      { name: "test-repo-abc123/packages/app/tsconfig.json" },
      JSON.stringify({ compilerOptions: { paths: { "@/*": ["./*"] } } }),
    );
    pack.entry(
      { name: "test-repo-abc123/packages/app/index.ts" },
      "export const app = true;",
    );
    pack.finalize();

    const chunks: Buffer[] = [];
    for await (const chunk of pack) {
      chunks.push(chunk as Buffer);
    }
    const gzippedBuffer = gzipSync(Buffer.concat(chunks));
    const arrayBuffer = gzippedBuffer.buffer.slice(
      gzippedBuffer.byteOffset,
      gzippedBuffer.byteOffset + gzippedBuffer.byteLength,
    );

    const result = await unpackRepositoryTarball(arrayBuffer, 10);
    expect(result.tsconfigContent).toBeDefined();
    expect(result.tsconfigContent).toContain('"@/*"');
  });

  it("prioritizes root tsconfig over nested tsconfig", async () => {
    const pack = tar.pack();

    pack.entry(
      { name: "test-repo-abc123/packages/app/tsconfig.json" },
      JSON.stringify({ compilerOptions: { paths: { "nested/*": ["./*"] } } }),
    );
    pack.entry(
      { name: "test-repo-abc123/tsconfig.json" },
      JSON.stringify({ compilerOptions: { paths: { "root/*": ["./*"] } } }),
    );
    pack.entry(
      { name: "test-repo-abc123/src/index.ts" },
      "export const ok = true;",
    );
    pack.finalize();

    const chunks: Buffer[] = [];
    for await (const chunk of pack) {
      chunks.push(chunk as Buffer);
    }
    const gzippedBuffer = gzipSync(Buffer.concat(chunks));
    const arrayBuffer = gzippedBuffer.buffer.slice(
      gzippedBuffer.byteOffset,
      gzippedBuffer.byteOffset + gzippedBuffer.byteLength,
    );

    const result = await unpackRepositoryTarball(arrayBuffer, 10);
    expect(result.tsconfigContent).toBeDefined();
    expect(result.tsconfigContent).toContain('"root/*"');
  });
  async function buildArchive(
    entries: readonly { readonly name: string; readonly content: string }[],
  ): Promise<ArrayBuffer> {
    const pack = tar.pack();
    for (const entry of entries) {
      pack.entry({ name: `repo-abc/${entry.name}` }, entry.content);
    }
    pack.finalize();

    const chunks: Buffer[] = [];
    for await (const chunk of pack) {
      chunks.push(chunk as Buffer);
    }
    const gzipped = gzipSync(Buffer.concat(chunks));
    return gzipped.buffer.slice(
      gzipped.byteOffset,
      gzipped.byteOffset + gzipped.byteLength,
    ) as ArrayBuffer;
  }

  it("stops retaining files past the retention cap but still counts them", async () => {
    const entries = Array.from({ length: 50 }, (_, i) => ({
      name: `pad/file${i}.txt`,
      content: "x",
    }));
    const archive = await buildArchive(entries);

    const result = await unpackRepositoryTarball(archive, {
      maxFiles: 200,
      includeNonSourceFiles: true,
      limits: { maxRetainedFiles: 10 },
    });

    expect(result.files.length).toBe(10);
    expect(result.totalFilesFound).toBe(50);
    expect(result.wasCapped).toBe(true);
  });

  it("stops retaining content once the retained byte budget is spent", async () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({
      name: `pad/file${i}.txt`,
      content: "y".repeat(1000),
    }));
    const archive = await buildArchive(entries);

    const result = await unpackRepositoryTarball(archive, {
      maxFiles: 200,
      includeNonSourceFiles: true,
      limits: { maxRetainedBytes: 5000 },
    });

    expect(result.files.length).toBe(5);
    expect(result.totalFilesFound).toBe(20);
  });

  it("aborts an archive that expands past the decompression bound", async () => {
    const archive = await buildArchive([
      { name: "src/big.ts", content: "a".repeat(200_000) },
    ]);

    await expect(
      unpackRepositoryTarball(archive, {
        maxFiles: 10,
        limits: { maxDecompressedBytes: 50_000 },
      }),
    ).rejects.toThrow(/expands beyond/);
  });

  it("reports the true eligible count when nothing is capped", async () => {
    const archive = await buildArchive([
      { name: "src/a.ts", content: "export const a = 1;" },
      { name: "src/b.ts", content: "export const b = 2;" },
    ]);

    const result = await unpackRepositoryTarball(archive, 10);
    expect(result.files.length).toBe(2);
    expect(result.totalFilesFound).toBe(2);
    expect(result.wasCapped).toBe(false);
  });
});
