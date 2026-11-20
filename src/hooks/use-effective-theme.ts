"use client";

import { useEffect, useState } from "react";
import { applyThemeClass, useWorkspaceStore } from "@/stores/workspace-store";

/** Resolves the saved theme and follows system changes while system is selected. */
export function useEffectiveTheme(): "dark" | "light" {
  const preference = useWorkspaceStore((state) => state.theme);
  const [systemDark, setSystemDark] = useState(true);

  useEffect(() => {
    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      setSystemDark(media.matches);
      applyThemeClass("system");
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [preference]);

  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}
