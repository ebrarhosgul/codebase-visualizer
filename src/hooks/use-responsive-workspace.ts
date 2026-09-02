"use client";

import { useEffect } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";

const SMALL_SCREEN_MEDIA_QUERY = "(max-width: 859px)";

/**
 * Hook that listens to viewport width changes and updates the workspace layout store.
 */
export function useResponsiveWorkspace(): void {
  const setSmallScreen = useWorkspaceStore((state) => state.setSmallScreen);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const media = window.matchMedia(SMALL_SCREEN_MEDIA_QUERY);
    setSmallScreen(media.matches);

    const listener = (event: MediaQueryListEvent) => {
      setSmallScreen(event.matches);
    };

    media.addEventListener("change", listener);
    return () => {
      media.removeEventListener("change", listener);
    };
  }, [setSmallScreen]);
}
