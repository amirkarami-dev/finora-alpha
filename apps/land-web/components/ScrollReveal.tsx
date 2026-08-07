"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Global scroll-reveal driver. Any element with the `reveal` class starts
 * hidden (see globals.css) and gets `jjm-in` added — with its `data-delay`
 * applied as a transition-delay — once it scrolls into view. Re-scans on
 * every route change so freshly-mounted page content animates in too.
 */
export default function ScrollReveal() {
  const pathname = usePathname();

  useEffect(() => {
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const reveal = () => {
      const vh = window.innerHeight || 800;
      document.querySelectorAll<HTMLElement>(".reveal:not(.jjm-in)").forEach((el) => {
        if (reduce) {
          el.classList.add("jjm-in");
          return;
        }
        const r = el.getBoundingClientRect();
        if (r.top < vh * 0.92 && r.bottom > -60) {
          el.style.transitionDelay = `${el.getAttribute("data-delay") || "0"}ms`;
          el.classList.add("jjm-in");
        }
      });
    };

    // Reveal anything already on screen, then watch for scrolling.
    requestAnimationFrame(() => {
      reveal();
      requestAnimationFrame(reveal);
    });
    window.addEventListener("scroll", reveal, { passive: true });
    window.addEventListener("resize", reveal);
    return () => {
      window.removeEventListener("scroll", reveal);
      window.removeEventListener("resize", reveal);
    };
  }, [pathname]);

  return null;
}
