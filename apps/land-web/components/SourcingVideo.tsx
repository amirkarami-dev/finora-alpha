"use client";

import { useEffect, useRef, useState } from "react";

interface SourcingVideoProps {
  src: string;
  /** One line under the frame, e.g. "Sourcing raw copper scrap · Sulaymaniyah". */
  caption: string;
}

/**
 * The yard on film. Plays silently and loops while it is on screen, pauses the moment it
 * scrolls away, and never autoplays for people who asked for reduced motion — they get a
 * play button instead. Two controls only, play and sound; the copper line along the bottom
 * edge is the progress bar.
 */
export default function SourcingVideo({ src, caption }: SourcingVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const frame = frameRef.current;
    if (!video || !frame) return;

    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduceMotion(reduce);

    const onTime = () => {
      if (video.duration > 0) setProgress(video.currentTime / video.duration);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);

    // Autoplay only while the frame is mostly on screen — a looping video nobody can see
    // is just battery. Reduced motion means no autoplay at all.
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
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      observer?.disconnect();
    };
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

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

        {/* Legibility scrim for the controls; leaves the top of the frame untouched. */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(10,13,15,0) 55%, rgba(10,13,15,0.72) 100%)", pointerEvents: "none" }} />

        {/* Big play affordance when paused — the only time the frame asks for a click. */}
        {!playing && (
          <button
            type="button"
            onClick={togglePlay}
            aria-label="Play video"
            className="yard-play"
            style={{
              position: "absolute",
              inset: 0,
              margin: "auto",
              width: 84,
              height: 84,
              borderRadius: "50%",
              border: "1px solid rgba(232,168,124,0.55)",
              background: "rgba(10,13,15,0.55)",
              backdropFilter: "blur(10px)",
              color: "var(--copper-light)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
          </button>
        )}

        {/* Controls: play/pause and sound, bottom-start. */}
        <div style={{ position: "absolute", insetInlineStart: 18, bottom: 18, display: "flex", gap: 10, zIndex: 2 }}>
          <button type="button" onClick={togglePlay} aria-label={playing ? "Pause video" : "Play video"} className="yard-ctl">
            {playing ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
            )}
          </button>
          <button type="button" onClick={toggleMute} aria-label={muted ? "Turn sound on" : "Turn sound off"} className="yard-ctl">
            {muted ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4V5z" /><path d="M16 9l5 6M21 9l-5 6" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4V5z" /><path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" /></svg>
            )}
          </button>
        </div>

        {/* Caption chip, bottom-end. */}
        <span
          style={{
            position: "absolute",
            insetInlineEnd: 18,
            bottom: 22,
            zIndex: 2,
            fontFamily: "var(--ff-body)",
            fontSize: 11.5,
            fontWeight: 500,
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "var(--text-dim)",
            padding: "7px 12px",
            borderRadius: 20,
            border: "1px solid rgba(245,240,235,0.16)",
            background: "rgba(10,13,15,0.45)",
            backdropFilter: "blur(8px)",
          }}
        >
          {caption}
        </span>

        {/* The pour line: playback progress as a thin copper edge. */}
        <div aria-hidden="true" style={{ position: "absolute", insetInline: 0, bottom: 0, height: 2, background: "rgba(245,240,235,0.08)" }}>
          <div style={{ height: "100%", width: `${Math.round(progress * 1000) / 10}%`, background: "var(--copper-gradient)", transition: reduceMotion ? "none" : "width 200ms linear" }} />
        </div>
      </div>
    </div>
  );
}
