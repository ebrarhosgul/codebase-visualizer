import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { KeySettingsDialog } from "../key-settings-dialog";

describe("KeySettingsDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn();
  });

  it("renders dialog when open is true with provider options and password input", () => {
    render(<KeySettingsDialog open={true} onOpenChange={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: /connect an ai provider/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Google Gemini")).toBeInTheDocument();
    expect(screen.getByText("OpenAI GPT")).toBeInTheDocument();
    expect(screen.getByText("Anthropic Claude")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/enter your gemini api key/i),
    ).toBeInTheDocument();
  });

  it("switches selected provider and updates placeholder and hint description", () => {
    render(<KeySettingsDialog open={true} onOpenChange={vi.fn()} />);

    const openaiButton = screen.getByRole("button", { name: /openai gpt/i });
    fireEvent.click(openaiButton);

    expect(
      screen.getByPlaceholderText(/enter your openai api key/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/requires openai api key with chat access/i),
    ).toBeInTheDocument();
  });

  it("displays error message if saving with an empty API key", async () => {
    render(<KeySettingsDialog open={true} onOpenChange={vi.fn()} />);

    const saveButton = screen.getByRole("button", { name: /save encrypted/i });
    fireEvent.click(saveButton);

    expect(
      await screen.findByText("Please enter an API key."),
    ).toBeInTheDocument();
  });

  it("submits API key to /api/ai/keys and calls onKeySaved upon success (covers: AC-3)", async () => {
    const onKeySaved = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, provider: "gemini" }),
    } as unknown as Response);

    render(
      <KeySettingsDialog
        open={true}
        onOpenChange={vi.fn()}
        onKeySaved={onKeySaved}
      />,
    );

    const input = screen.getByPlaceholderText(/enter your gemini api key/i);
    fireEvent.change(input, { target: { value: "test-secret-key-xyz" } });

    const saveButton = screen.getByRole("button", { name: /save encrypted/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/ai/keys",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "gemini",
            apiKey: "test-secret-key-xyz",
          }),
        }),
      );
    });

    expect(
      await screen.findByText(
        "Key for gemini securely saved in encrypted cookie.",
      ),
    ).toBeInTheDocument();
    expect(onKeySaved).toHaveBeenCalledWith("gemini");
    expect(input).toHaveValue("");
  });

  it("displays error status when saving API key fails with non 200 response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Invalid API key format" }),
    } as unknown as Response);

    render(<KeySettingsDialog open={true} onOpenChange={vi.fn()} />);

    const input = screen.getByPlaceholderText(/enter your gemini api key/i);
    fireEvent.change(input, { target: { value: "bad-key" } });

    const saveButton = screen.getByRole("button", { name: /save encrypted/i });
    fireEvent.click(saveButton);

    expect(
      await screen.findByText("Invalid API key format"),
    ).toBeInTheDocument();
  });

  it("clears stored API key via DELETE /api/ai/keys and calls onKeyCleared (covers: AC-3)", async () => {
    const onKeyCleared = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    } as unknown as Response);

    render(
      <KeySettingsDialog
        open={true}
        onOpenChange={vi.fn()}
        onKeyCleared={onKeyCleared}
      />,
    );

    const clearButton = screen.getByRole("button", {
      name: /clear stored key/i,
    });
    fireEvent.click(clearButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/ai/keys?scope=chat",
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    expect(
      await screen.findByText("Stored API credentials cleared."),
    ).toBeInTheDocument();
    expect(onKeyCleared).toHaveBeenCalledTimes(1);
  });

  it("displays error status when clearing key fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Server error" }),
    } as unknown as Response);

    render(<KeySettingsDialog open={true} onOpenChange={vi.fn()} />);

    const clearButton = screen.getByRole("button", {
      name: /clear stored key/i,
    });
    fireEvent.click(clearButton);

    expect(await screen.findByText("HTTP 500")).toBeInTheDocument();
  });

  it("calls onOpenChange(false) when close button is clicked", () => {
    const onOpenChange = vi.fn();
    render(<KeySettingsDialog open={true} onOpenChange={onOpenChange} />);

    const closeButtons = screen.getAllByRole("button", { name: /close/i });
    expect(closeButtons.length).toBeGreaterThan(0);
    fireEvent.click(closeButtons[closeButtons.length - 1]);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  describe("Key visibility, summary, and granular key deletion", () => {
    it("displays configured provider keys summary and count, and updates when a new key is saved", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          provider: "openai",
          maskedKey: "sk-p••••9876",
        }),
      } as unknown as Response);

      render(
        <KeySettingsDialog
          open={true}
          onOpenChange={vi.fn()}
          configuredProviders={["gemini"]}
          maskedKeys={{ gemini: "AIza••••1234" }}
        />,
      );

      expect(screen.getByTestId("configured-keys-count")).toHaveTextContent(
        "1 key configured",
      );
      expect(
        screen.getByTestId("configured-key-item-gemini"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("masked-key-gemini")).toHaveTextContent(
        "AIza••••1234",
      );
      expect(
        screen.getByTestId("provider-configured-gemini"),
      ).toBeInTheDocument();

      // Switch to OpenAI and save a second key
      fireEvent.click(screen.getByTestId("provider-radio-openai"));
      fireEvent.change(screen.getByTestId("api-key-input"), {
        target: { value: "sk-proj-testkey9876" },
      });
      fireEvent.click(screen.getByTestId("save-key-btn"));

      await waitFor(() => {
        expect(screen.getByTestId("configured-keys-count")).toHaveTextContent(
          "2 keys configured",
        );
      });
      expect(
        screen.getByTestId("configured-key-item-openai"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("masked-key-openai")).toHaveTextContent(
        "sk-p••••9876",
      );
    });

    it("deletes an individual provider key without wiping other configured keys", async () => {
      const onKeyCleared = vi.fn();
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          provider: "gemini",
          configuredProviders: ["openai"],
        }),
      } as unknown as Response);

      render(
        <KeySettingsDialog
          open={true}
          onOpenChange={vi.fn()}
          configuredProviders={["gemini", "openai"]}
          maskedKeys={{ gemini: "AIza••••1234", openai: "sk-p••••9876" }}
          onKeyCleared={onKeyCleared}
        />,
      );

      expect(screen.getByTestId("configured-keys-count")).toHaveTextContent(
        "2 keys configured",
      );

      fireEvent.click(screen.getByTestId("delete-key-gemini"));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/ai/keys?provider=gemini",
          expect.objectContaining({ method: "DELETE" }),
        );
      });

      expect(screen.getByTestId("configured-keys-count")).toHaveTextContent(
        "1 key configured",
      );
      expect(
        screen.queryByTestId("configured-key-item-gemini"),
      ).not.toBeInTheDocument();
      expect(
        screen.getByTestId("configured-key-item-openai"),
      ).toBeInTheDocument();
      expect(onKeyCleared).toHaveBeenCalledWith("gemini");
    });

    it("toggles API key input visibility between password and text", () => {
      render(<KeySettingsDialog open={true} onOpenChange={vi.fn()} />);

      const input = screen.getByTestId("api-key-input");
      expect(input).toHaveAttribute("type", "password");

      const toggleBtn = screen.getByTestId("toggle-key-visibility");
      fireEvent.click(toggleBtn);
      expect(input).toHaveAttribute("type", "text");

      fireEvent.click(toggleBtn);
      expect(input).toHaveAttribute("type", "password");
    });

    it("clears status message when dialog is closed and reopened", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          provider: "gemini",
          configuredProviders: [],
        }),
      } as unknown as Response);

      const { rerender } = render(
        <KeySettingsDialog
          open={true}
          onOpenChange={vi.fn()}
          configuredProviders={["gemini"]}
        />,
      );

      fireEvent.click(screen.getByTestId("delete-key-gemini"));

      expect(
        await screen.findByText("Stored gemini credentials cleared."),
      ).toBeInTheDocument();

      // Close and reopen popup
      rerender(
        <KeySettingsDialog
          open={false}
          onOpenChange={vi.fn()}
          configuredProviders={[]}
        />,
      );
      rerender(
        <KeySettingsDialog
          open={true}
          onOpenChange={vi.fn()}
          configuredProviders={[]}
        />,
      );

      expect(
        screen.queryByText("Stored gemini credentials cleared."),
      ).not.toBeInTheDocument();
    });
  });
});
