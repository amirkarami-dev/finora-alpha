"use client";

import { useEffect } from "react";
import { site } from "@/lib/site";
import { WhatsAppMark } from "./icons";

export default function ContactModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-hidden={!open}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(6,8,9,0.72)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        opacity: open ? 1 : 0,
        visibility: open ? "visible" : "hidden",
        transition: "opacity .35s ease, visibility .35s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "min(94vw,460px)",
          padding: "38px 34px 32px",
          overflow: "hidden",
          background: "linear-gradient(165deg,rgba(26,31,36,0.96),rgba(17,21,24,0.98))",
          border: "1px solid rgba(184,115,51,0.4)",
          borderRadius: 22,
          boxShadow: "0 40px 90px rgba(0,0,0,0.65), inset 0 1px 0 rgba(232,168,124,0.16)",
          transform: open ? "translateY(0) scale(1)" : "translateY(24px) scale(0.96)",
          opacity: open ? 1 : 0,
          transition: "all .42s cubic-bezier(.16,1,.3,1)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -90,
            right: -60,
            width: 240,
            height: 240,
            background: "radial-gradient(circle, rgba(184,115,51,0.28), transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <button
          onClick={onClose}
          aria-label="Close"
          className="modal-close"
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            width: 34,
            height: 34,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 9,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "var(--muted)",
            cursor: "pointer",
            transition: "all .2s",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <span style={{ fontFamily: "var(--ff-body)", fontSize: 11, fontWeight: 600, letterSpacing: ".24em", textTransform: "uppercase", color: "var(--copper)" }}>
          Pricing Enquiry
        </span>
        <h3 style={{ fontFamily: "var(--ff-display)", fontSize: 30, fontWeight: 700, color: "var(--text)", margin: "10px 0 10px" }}>Contact for Price</h3>
        <p style={{ fontFamily: "var(--ff-body)", fontSize: 13.5, lineHeight: 1.65, color: "var(--muted)", margin: "0 0 24px" }}>
          All pricing is quoted live against current LME rates, grade &amp; volume. Reach our trade desk directly — we respond within hours.
        </p>

        <ModalRow href={`tel:${site.phones.uae.tel}`} label="Call our trade desk" value={site.phones.uae.display}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M5 4h4l2 5-3 2a12 12 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" stroke="var(--copper-light)" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        </ModalRow>
        <ModalRow href={`mailto:${site.email}`} label="Email us" value={site.email}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="5" width="18" height="14" rx="2" stroke="var(--copper-light)" strokeWidth="1.6" />
            <path d="M4 7l8 6 8-6" stroke="var(--copper-light)" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </ModalRow>

        <div style={{ display: "flex", gap: 11, marginTop: 22 }}>
          <a
            href={site.whatsapp}
            target="_blank"
            rel="noopener"
            className="wa-cta-card"
            style={{
              flex: 1.3,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 9,
              textDecoration: "none",
              padding: 14,
              borderRadius: 13,
              background: "linear-gradient(135deg,#25D366,#1faa50)",
              color: "#fff",
              fontFamily: "var(--ff-body)",
              fontSize: 14.5,
              fontWeight: 600,
              boxShadow: "0 10px 26px rgba(37,211,102,0.36)",
            }}
          >
            <WhatsAppMark width={19} height={19} style={{ color: "#fff" }} />
            Open WhatsApp
          </a>
          <a
            href={`mailto:${site.email}`}
            className="email-cta"
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: "none",
              padding: 14,
              borderRadius: 13,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(184,115,51,0.4)",
              color: "var(--text)",
              fontFamily: "var(--ff-body)",
              fontSize: 14.5,
              fontWeight: 600,
              transition: "all .25s",
            }}
          >
            Send Email
          </a>
        </div>
      </div>
    </div>
  );
}

function ModalRow({ href, label, value, children }: { href: string; label: string; value: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="jjm-cc"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        textDecoration: "none",
        padding: "13px 15px",
        borderRadius: 13,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(184,115,51,0.16)",
        marginBottom: 11,
      }}
    >
      <span style={{ width: 40, height: 40, flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 11, background: "rgba(184,115,51,0.14)" }}>
        {children}
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontFamily: "var(--ff-body)", fontSize: 11.5, color: "var(--muted)", letterSpacing: ".04em" }}>{label}</span>
        <span style={{ fontFamily: "var(--ff-body)", fontSize: 15, fontWeight: 600, color: "var(--text)", overflowWrap: "anywhere" }}>{value}</span>
      </span>
    </a>
  );
}
