"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

/** Follow the application's selected theme, including an explicit system override. */
export function ThemeFavicon() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (!resolvedTheme) return;
    const icons = document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]');
    icons.forEach((icon) => {
      icon.href = `/brand/favicon-${resolvedTheme === "dark" ? "dark" : "light"}.svg`;
      icon.type = "image/svg+xml";
      icon.removeAttribute("media");
    });
  }, [resolvedTheme]);
  return null;
}
