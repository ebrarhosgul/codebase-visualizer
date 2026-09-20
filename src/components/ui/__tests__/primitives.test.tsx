import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Play } from "lucide-react";
import { Button } from "../button";
import { IconButton } from "../icon-button";
import { Badge } from "../badge";
import { Input } from "../input";
import { Tooltip } from "../tooltip";
import { Dialog } from "../dialog";
import { Tabs } from "../tabs";
import { DropdownMenu } from "../dropdown-menu";
import { Toast } from "../toast";

describe("Button Primitive", () => {
  it("renders with label and handles click events", () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click Me</Button>);

    const button = screen.getByRole("button", { name: "Click Me" });
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("shows loading spinner and disables button when loading", () => {
    render(<Button loading>Submit</Button>);
    const button = screen.getByRole("button", { name: "Submit" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("applies danger variant classes", () => {
    render(<Button variant="danger">Delete</Button>);
    const button = screen.getByRole("button", { name: "Delete" });
    expect(button.className).toContain("bg-status-error-solid");
  });

  it("uses the pointer cursor across every variant and size", () => {
    for (const variant of [
      "primary",
      "secondary",
      "ghost",
      "danger",
    ] as const) {
      for (const size of ["sm", "md", "lg"] as const) {
        const { unmount } = render(
          <Button variant={variant} size={size}>
            {`${variant}-${size}`}
          </Button>,
        );
        expect(
          screen.getByRole("button", { name: `${variant}-${size}` }).className,
        ).toContain("cursor-pointer");
        unmount();
      }
    }
  });
});

describe("IconButton Primitive", () => {
  it("renders with mandatory accessible name and responds to clicks", () => {
    const handleClick = vi.fn();
    render(
      <IconButton icon={Play} label="Start simulation" onClick={handleClick} />,
    );

    const button = screen.getByRole("button", { name: "Start simulation" });
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("uses the pointer cursor", () => {
    render(<IconButton icon={Play} label="Start simulation" />);
    expect(
      screen.getByRole("button", { name: "Start simulation" }).className,
    ).toContain("cursor-pointer");
  });
});

describe("Badge Primitive", () => {
  it("renders with default and syntax variants", () => {
    const { rerender } = render(<Badge variant="default">Status</Badge>);
    expect(screen.getByText("Status")).toBeInTheDocument();

    rerender(<Badge variant="syntax-ts">TypeScript</Badge>);
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("TypeScript").className).toContain("font-mono");
  });
});

describe("Input Primitive", () => {
  it("renders label, placeholder, and responds to text changes", () => {
    const handleChange = vi.fn();
    render(
      <Input
        label="Repository URL"
        placeholder="https://github.com/..."
        onChange={handleChange}
      />,
    );

    const input = screen.getByLabelText("Repository URL");
    expect(input).toBeInTheDocument();
    fireEvent.change(input, {
      target: { value: "https://github.com/foo/bar" },
    });
    expect(handleChange).toHaveBeenCalled();
  });

  it("displays error message and sets aria-invalid", () => {
    render(<Input label="Query" error="Invalid search term" />);
    const input = screen.getByLabelText("Query");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid search term");
  });
});

describe("Tooltip Primitive", () => {
  it("renders trigger element", () => {
    render(
      <Tooltip content="Helper information">
        <button type="button">Hover trigger</button>
      </Tooltip>,
    );

    expect(
      screen.getByRole("button", { name: "Hover trigger" }),
    ).toBeInTheDocument();
  });
});

describe("Dialog Primitive", () => {
  it("renders title, description, and children when open", () => {
    const handleOpenChange = vi.fn();
    render(
      <Dialog
        open={true}
        onOpenChange={handleOpenChange}
        title="Settings Modal"
        description="Configure graph layout"
      >
        <div>Settings Content</div>
      </Dialog>,
    );

    expect(screen.getByText("Settings Modal")).toBeInTheDocument();
    expect(screen.getByText("Configure graph layout")).toBeInTheDocument();
    expect(screen.getByText("Settings Content")).toBeInTheDocument();

    const closeButton = screen.getByLabelText("Close dialog");
    fireEvent.click(closeButton);
    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("Tabs Primitive", () => {
  it("renders tab items and handles tab switching", () => {
    const handleValueChange = vi.fn();
    render(
      <Tabs
        value="code"
        onValueChange={handleValueChange}
        items={[
          {
            value: "code",
            label: "Code Viewer",
            content: <div>Code Pane Content</div>,
          },
          {
            value: "inspector",
            label: "Symbol Inspector",
            content: <div>Inspector Content</div>,
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("tab", { name: "Code Viewer" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Symbol Inspector" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Code Pane Content")).toBeInTheDocument();

    const inspectorTab = screen.getByRole("tab", { name: "Symbol Inspector" });
    fireEvent.mouseDown(inspectorTab, { button: 0 });
    expect(handleValueChange).toHaveBeenCalledWith("inspector");
  });
});

describe("DropdownMenu Primitive", () => {
  it("renders trigger button", () => {
    render(
      <DropdownMenu
        trigger={<button type="button">Menu Options</button>}
        items={[
          { id: "opt-1", label: "Format Document" },
          { type: "separator" },
          { id: "opt-2", label: "Reset View", danger: true },
        ]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Menu Options" }),
    ).toBeInTheDocument();
  });
});

describe("Toast Primitive", () => {
  it("renders toast message and triggers manual dismissal", () => {
    const handleClose = vi.fn();
    render(
      <Toast
        message="Operation completed successfully"
        variant="success"
        onClose={handleClose}
      />,
    );

    expect(
      screen.getByText("Operation completed successfully"),
    ).toBeInTheDocument();

    const dismissButton = screen.getByRole("button", {
      name: "Dismiss notification",
    });
    fireEvent.click(dismissButton);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("auto dismisses after specified durationMs even when parent re-renders", () => {
    vi.useFakeTimers();
    const handleClose = vi.fn();

    const { rerender } = render(
      <Toast
        message="Warning occurred"
        variant="warning"
        durationMs={3000}
        onClose={handleClose}
      />,
    );

    // Advance halfway through timer
    vi.advanceTimersByTime(1500);
    expect(handleClose).not.toHaveBeenCalled();

    // Re-render with new function reference for onClose (simulating parent re-render)
    const newHandleClose = vi.fn();
    rerender(
      <Toast
        message="Warning occurred"
        variant="warning"
        durationMs={3000}
        onClose={newHandleClose}
      />,
    );

    // Advance remainder of timer
    vi.advanceTimersByTime(1600);
    expect(newHandleClose).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
