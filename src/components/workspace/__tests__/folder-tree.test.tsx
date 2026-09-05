import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { FolderTree } from "../folder-tree";
import type { FileNode } from "@/entities";

function createMockFile(
  path: string,
  language = "typescript",
  ext = ".ts",
): FileNode {
  const parts = path.split("/");
  const name = parts[parts.length - 1] ?? path;
  return {
    id: `file:${path}`,
    path,
    name,
    extension: ext,
    language,
    sizeBytes: 500,
    lineCount: 20,
    directoryId: `dir:${parts.slice(0, -1).join("/")}`,
    symbolIds: [],
    importIds: [],
    exportIds: [],
  };
}

describe("FolderTree component", () => {
  const sampleFiles: FileNode[] = [
    createMockFile("src/index.ts", "typescript", ".ts"),
    createMockFile("src/components/button.tsx", "typescript", ".tsx"),
    createMockFile("src/utils/math.js", "javascript", ".js"),
    createMockFile("package.json", "json", ".json"),
    createMockFile("README.md", "markdown", ".md"),
  ];

  it("by default only renders code files (TS/JS) and hides non-code files", () => {
    render(
      <FolderTree
        files={sampleFiles}
        selectedFileId={null}
        onSelectFile={vi.fn()}
        showAllFiles={false}
      />,
    );

    // Code files should be visible
    expect(
      screen.getByRole("button", { name: "File src/index.ts" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "File src/components/button.tsx" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "File src/utils/math.js" }),
    ).toBeInTheDocument();

    // Non-code files should NOT be visible when showAllFiles is false
    expect(screen.queryByText("package.json")).not.toBeInTheDocument();
    expect(screen.queryByText("README.md")).not.toBeInTheDocument();
  });

  it("displays non-code files when showAllFiles is true, with disabled state and 'Not allowed yet' tooltip", () => {
    render(
      <FolderTree
        files={sampleFiles}
        selectedFileId={null}
        onSelectFile={vi.fn()}
        showAllFiles={true}
      />,
    );

    // Non-code files should be rendered
    const packageJsonItem = screen.getByLabelText(
      "package.json (Not allowed yet)",
    );
    expect(packageJsonItem).toBeInTheDocument();
    expect(packageJsonItem).toHaveAttribute("aria-disabled", "true");

    const readmeItem = screen.getByLabelText("README.md (Not allowed yet)");
    expect(readmeItem).toBeInTheDocument();
    expect(readmeItem).toHaveAttribute("aria-disabled", "true");
  });

  it("clicking a non-code file does not trigger onSelectFile", () => {
    const onSelectFile = vi.fn();
    render(
      <FolderTree
        files={sampleFiles}
        selectedFileId={null}
        onSelectFile={onSelectFile}
        showAllFiles={true}
      />,
    );

    const packageJsonItem = screen.getByLabelText(
      "package.json (Not allowed yet)",
    );
    fireEvent.click(packageJsonItem);
    expect(onSelectFile).not.toHaveBeenCalled();
  });

  it("clicking a code file triggers onSelectFile with the file id", () => {
    const onSelectFile = vi.fn();
    render(
      <FolderTree
        files={sampleFiles}
        selectedFileId={null}
        onSelectFile={onSelectFile}
        showAllFiles={false}
      />,
    );

    const fileItem = screen.getByRole("button", { name: "File src/index.ts" });
    fireEvent.click(fileItem);
    expect(onSelectFile).toHaveBeenCalledWith("file:src/index.ts");
  });

  it("hovering and unhovering a code file triggers onHoverFile", () => {
    const onHoverFile = vi.fn();
    render(
      <FolderTree
        files={sampleFiles}
        selectedFileId={null}
        onSelectFile={vi.fn()}
        onHoverFile={onHoverFile}
        showAllFiles={false}
      />,
    );

    const fileItem = screen.getByRole("button", { name: "File src/index.ts" });
    fireEvent.mouseEnter(fileItem);
    expect(onHoverFile).toHaveBeenCalledWith("file:src/index.ts");

    fireEvent.mouseLeave(fileItem);
    expect(onHoverFile).toHaveBeenCalledWith(null);
  });

  it("expands and collapses folders when clicking folder rows", () => {
    render(
      <FolderTree
        files={sampleFiles}
        selectedFileId={null}
        onSelectFile={vi.fn()}
        showAllFiles={false}
      />,
    );

    const componentsFolder = screen.getByRole("button", {
      name: "Folder components",
    });
    expect(componentsFolder).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: "File src/components/button.tsx" }),
    ).toBeInTheDocument();

    // Click to collapse
    act(() => {
      fireEvent.click(componentsFolder);
    });
    expect(componentsFolder).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: "File src/components/button.tsx" }),
    ).not.toBeInTheDocument();

    // Click to expand again
    act(() => {
      fireEvent.click(componentsFolder);
    });
    expect(componentsFolder).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: "File src/components/button.tsx" }),
    ).toBeInTheDocument();
  });

  it("collapses all folders with collapse all button, and expands all with expand all button", () => {
    render(
      <FolderTree
        files={sampleFiles}
        selectedFileId={null}
        onSelectFile={vi.fn()}
        showAllFiles={false}
      />,
    );

    const collapseAllBtn = screen.getByRole("button", {
      name: "Collapse all folders",
    });
    act(() => {
      fireEvent.click(collapseAllBtn);
    });

    // Subfiles should no longer be rendered
    expect(
      screen.queryByRole("button", { name: "File src/components/button.tsx" }),
    ).not.toBeInTheDocument();

    const expandAllBtn = screen.getByRole("button", {
      name: "Expand all folders",
    });
    act(() => {
      fireEvent.click(expandAllBtn);
    });

    expect(
      screen.getByRole("button", { name: "File src/components/button.tsx" }),
    ).toBeInTheDocument();
  });

  it("filters files matching searchQuery and automatically expands matching ancestor folders", () => {
    render(
      <FolderTree
        files={sampleFiles}
        selectedFileId={null}
        onSelectFile={vi.fn()}
        searchQuery="math"
        showAllFiles={false}
      />,
    );

    expect(
      screen.getByRole("button", { name: "File src/utils/math.js" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "File src/index.ts" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "File src/components/button.tsx" }),
    ).not.toBeInTheDocument();
  });

  it("applies distinct extension-specific colors and badges across file types", () => {
    render(
      <FolderTree
        files={sampleFiles}
        selectedFileId={null}
        onSelectFile={vi.fn()}
        showAllFiles={true}
      />,
    );

    // .tsx file should have cyan badge class
    const buttonFile = screen.getByRole("button", {
      name: "File src/components/button.tsx",
    });
    expect(buttonFile).toHaveTextContent(".tsx");

    // package.json should have emerald badge class
    const jsonFile = screen.getByLabelText("package.json (Not allowed yet)");
    expect(jsonFile).toHaveTextContent(".json");

    // README.md should have purple badge class
    const readmeFile = screen.getByLabelText("README.md (Not allowed yet)");
    expect(readmeFile).toHaveTextContent(".md");
  });
});
