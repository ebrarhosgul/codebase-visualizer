import { describe, it, expect } from "vitest";
import {
  createWorkerRequest,
  createWorkerSuccessResponse,
  createWorkerErrorResponse,
  isLayoutWorkerSuccessResponse,
  isLayoutWorkerErrorResponse,
  type LayoutWorkerRequestPayload,
  type LayoutWorkerSuccessPayload,
} from "../worker-types";
import type { CodebaseGraph } from "@/entities";

describe("worker-types message envelopes", () => {
  it("creates a well-formed immutable request envelope (AC-7)", () => {
    const payload: LayoutWorkerRequestPayload = {
      graph: {
        files: {},
        directories: {},
        symbols: {},
        externalModules: {},
        edges: {},
      } as unknown as CodebaseGraph,
      filters: {
        selectedLayers: [],
        collapsedFolderIds: [],
        searchQuery: "",
        hideExternal: false,
      },
      options: { direction: "LR" },
    };

    const request = createWorkerRequest("req-1", "COMPUTE_LAYOUT", payload);

    expect(request.id).toBe("req-1");
    expect(request.type).toBe("COMPUTE_LAYOUT");
    expect(request.payload).toBe(payload);
    expect(typeof request.timestamp).toBe("number");
    expect(Object.isFrozen(request)).toBe(true);
  });

  it("creates a well-formed immutable success response envelope (AC-7)", () => {
    const payload: LayoutWorkerSuccessPayload = {
      nodes: [],
      edges: [],
      durationMs: 42,
    };

    const response = createWorkerSuccessResponse("req-1", payload);

    expect(response.id).toBe("req-1");
    expect(response.type).toBe("LAYOUT_SUCCESS");
    expect(response.payload.durationMs).toBe(42);
    expect(Object.isFrozen(response)).toBe(true);
  });

  it("creates a well-formed immutable error response envelope (AC-7)", () => {
    const errorResponse = createWorkerErrorResponse(
      "req-2",
      "TIMEOUT",
      "Layout calculation timed out after 5000ms",
    );

    expect(errorResponse.id).toBe("req-2");
    expect(errorResponse.type).toBe("LAYOUT_ERROR");
    expect(errorResponse.payload.code).toBe("TIMEOUT");
    expect(errorResponse.payload.message).toContain("5000ms");
    expect(Object.isFrozen(errorResponse)).toBe(true);
    expect(Object.isFrozen(errorResponse.payload)).toBe(true);
  });

  describe("type guards", () => {
    it("validates valid success envelopes", () => {
      const validSuccess = createWorkerSuccessResponse("req-1", {
        nodes: [],
        edges: [],
        durationMs: 10,
      });

      expect(isLayoutWorkerSuccessResponse(validSuccess)).toBe(true);
      expect(isLayoutWorkerErrorResponse(validSuccess)).toBe(false);
    });

    it("rejects malformed success envelopes", () => {
      expect(isLayoutWorkerSuccessResponse(null)).toBe(false);
      expect(isLayoutWorkerSuccessResponse({})).toBe(false);
      expect(
        isLayoutWorkerSuccessResponse({
          type: "LAYOUT_SUCCESS",
          id: "req-1",
          timestamp: Date.now(),
          payload: { nodes: "not-an-array", edges: [], durationMs: 10 },
        }),
      ).toBe(false);
    });

    it("validates valid error envelopes", () => {
      const validError = createWorkerErrorResponse(
        "req-1",
        "LAYOUT_FAILED",
        "Calculation crashed",
      );

      expect(isLayoutWorkerErrorResponse(validError)).toBe(true);
      expect(isLayoutWorkerSuccessResponse(validError)).toBe(false);
    });

    it("rejects non object and primitive inputs", () => {
      expect(isLayoutWorkerSuccessResponse(undefined)).toBe(false);
      expect(isLayoutWorkerSuccessResponse(42)).toBe(false);
      expect(isLayoutWorkerSuccessResponse("string")).toBe(false);
      expect(isLayoutWorkerSuccessResponse(true)).toBe(false);

      expect(isLayoutWorkerErrorResponse(undefined)).toBe(false);
      expect(isLayoutWorkerErrorResponse(42)).toBe(false);
      expect(isLayoutWorkerErrorResponse("string")).toBe(false);
      expect(isLayoutWorkerErrorResponse(true)).toBe(false);
    });

    it("rejects success envelopes with incomplete payload structures", () => {
      expect(
        isLayoutWorkerSuccessResponse({
          type: "LAYOUT_SUCCESS",
          id: "req-1",
          timestamp: Date.now(),
          payload: { nodes: [], edges: "not-array", durationMs: 10 },
        }),
      ).toBe(false);

      expect(
        isLayoutWorkerSuccessResponse({
          type: "LAYOUT_SUCCESS",
          id: "req-1",
          timestamp: Date.now(),
          payload: { nodes: [], edges: [] },
        }),
      ).toBe(false);

      expect(
        isLayoutWorkerSuccessResponse({
          type: "LAYOUT_SUCCESS",
          id: 123,
          timestamp: Date.now(),
          payload: { nodes: [], edges: [], durationMs: 5 },
        }),
      ).toBe(false);
    });

    it("rejects error envelopes with invalid codes or messages", () => {
      expect(
        isLayoutWorkerErrorResponse({
          type: "LAYOUT_ERROR",
          id: "req-1",
          timestamp: Date.now(),
          payload: { code: "TIMEOUT" },
        }),
      ).toBe(false);

      expect(
        isLayoutWorkerErrorResponse({
          type: "LAYOUT_ERROR",
          id: "req-1",
          timestamp: Date.now(),
          payload: { code: 999, message: "Error" },
        }),
      ).toBe(false);

      expect(
        isLayoutWorkerErrorResponse({
          type: "OTHER_TYPE",
          id: "req-1",
          timestamp: Date.now(),
          payload: { code: "TIMEOUT", message: "Timeout" },
        }),
      ).toBe(false);
    });
  });
});
