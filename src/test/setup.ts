import "@testing-library/jest-dom/vitest";

// Polyfill window.matchMedia for jsdom tests
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// Polyfill ResizeObserver for jsdom tests
if (typeof globalThis.ResizeObserver === "undefined") {
  class MockResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = MockResizeObserver;
}

// Polyfill localStorage for Node 22 jsdom tests where globalThis.localStorage lacks setItem
const createStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string): string | null => store[key] ?? null,
    setItem: (key: string, value: string): void => {
      store[key] = String(value);
    },
    removeItem: (key: string): void => {
      delete store[key];
    },
    clear: (): void => {
      store = {};
    },
    key: (index: number): string | null => Object.keys(store)[index] ?? null,
    get length(): number {
      return Object.keys(store).length;
    },
  };
};

const mockLocalStorage = createStorageMock();
try {
  Object.defineProperty(globalThis, "localStorage", {
    value: mockLocalStorage,
    writable: true,
    configurable: true,
  });
} catch {
  // Ignore if property definition fails
}

if (typeof window !== "undefined") {
  try {
    Object.defineProperty(window, "localStorage", {
      value: mockLocalStorage,
      writable: true,
      configurable: true,
    });
  } catch {
    // Ignore if property definition fails
  }
}
