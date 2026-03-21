"use client";

import { useEffect, useState } from "react";

/** Returns the natural pixel dimensions of an image URL, or {0,0} until loaded.
 *  Keeps the previous dimensions while a new URL is loading to prevent map flicker. */
export function useImageSize(url: string | null): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!url) { setSize({ width: 0, height: 0 }); return; }
    const img = new Image();
    img.onload = () => setSize({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = url;
    // Don't reset to {0,0} on URL change — keep old size until new image loads
  }, [url]);
  return size;
}
