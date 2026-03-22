"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Hook that returns a ref to attach to a section and a boolean `visible`
 * that flips to true when the element scrolls into the viewport.
 */
export function useRevealOnScroll(threshold = 0.15) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, visible };
}
