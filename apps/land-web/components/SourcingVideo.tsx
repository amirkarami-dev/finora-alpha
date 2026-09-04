"use client";

import { useEffect, useRef } from "react";

interface SourcingVideoProps {
  src: string;
  /** One line under the frame, e.g. "Sourcing raw copper scrap · Sulaymaniyah". */
  caption: string;
}

/**
 * Presentation footage. Plays silently and loops while it is on screen, then pauses when
 * it scrolls away. Reduced-motion users see a still frame instead of autoplay.
 */
export default function SourcingVideo({ src, caption }: SourcingVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    const frame = frameRef.current;
    if (!video || !frame) return;

    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Autoplay only while the frame is mostly on screen; reduced motion means no autoplay.
    let observer: IntersectionObserver | undefined;
    if (!reduce && "IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) void video.play().catch(() => undefined);
          else video.pause();
        },
        { threshold: 0.45 },
      );
      observer.observe(frame);
    }

    return () => {
      observer?.disconnect();
    };
  }, []);

  return (
    <div>
      <div
        ref={frameRef}
        className="yard-frame"
        style={{
          position: "relative",
          borderRadius: 22,
          overflow: "hidden",
          aspectRatio: "16 / 9",
          background: "#0e1114",
          border: "1px solid rgba(184,115,51,0.32)",
          boxShadow: "0 30px 70px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(245,240,235,0.03)",
        }}
      >
        <video
          ref={videoRef}
          src={src}
          muted
          loop
          playsInline
          preload="metadata"
          aria-label={caption}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />

      </div>
    </div>
  );
}
