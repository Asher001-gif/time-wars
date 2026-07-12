import * as React from "react";

/**
 * Strict device detection: a device is "mobile" only if it has a coarse
 * primary pointer (touchscreen) AND no fine pointer (mouse). This prevents
 * desktops with narrow windows from being treated as mobile, and prevents
 * tablets-with-mouse from getting touch-only UI.
 */
export function useIsMobileDevice() {
  const [isMobile, setIsMobile] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return detect();
  });

  React.useEffect(() => {
    const update = () => setIsMobile(detect());
    update();
    const mqlCoarse = window.matchMedia("(pointer: coarse)");
    const mqlFine = window.matchMedia("(any-pointer: fine)");
    mqlCoarse.addEventListener("change", update);
    mqlFine.addEventListener("change", update);
    return () => {
      mqlCoarse.removeEventListener("change", update);
      mqlFine.removeEventListener("change", update);
    };
  }, []);

  return isMobile;
}

function detect(): boolean {
  if (typeof window === "undefined") return false;
  // Touch-only detection (no user-agent sniffing).
  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const hasFine = window.matchMedia("(any-pointer: fine)").matches;
  // Treat as mobile if device has touch and no fine pointer (mouse).
  return hasTouch && !hasFine;
}

/** Returns true when the viewport is in portrait orientation. */
export function useIsPortrait() {
  const [portrait, setPortrait] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(orientation: portrait)").matches;
  });
  React.useEffect(() => {
    const mql = window.matchMedia("(orientation: portrait)");
    const onChange = () => setPortrait(mql.matches);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return portrait;
}
