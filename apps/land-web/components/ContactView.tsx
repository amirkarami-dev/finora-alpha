"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { site } from "@/lib/site";
import { WhatsAppGlyph } from "./icons";

const cardBase = {
  display: "flex",
  alignItems: "center",
  gap: 15,
  textDecoration: "none",
  padding: "18px 20px",
  borderRadius: 16,
  background: "linear-gradient(165deg,rgba(26,31,36,0.7),rgba(17,21,24,0.85))",
  border: "1px solid rgba(184,115,51,0.2)",
  backdropFilter: "blur(14px)",
} as const;

const iconWrap = { width: 46, height: 46, flex: "0 0 auto", borderRadius: 12, background: "rgba(184,115,51,0.16)", display: "flex", alignItems: "center", justifyContent: "center" } as const;
const labelStyle = { fontFamily: "var(--ff-body)", fontSize: 11.5, color: "var(--muted)", letterSpacing: ".06em" } as const;
const fieldLabel = { fontFamily: "var(--ff-body)", fontSize: 11.5, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase" as const, color: "var(--muted)" };

const phoneIcon = (
  <path d="M5 4h4l2 5-3 2a12 12 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" stroke="var(--copper-light)" strokeWidth="1.6" strokeLinejoin="round" />
);

function ContactCard({ href, label, value, icon }: { href: string; label: string; value: string; icon: ReactNode }) {
  return (
    <a href={href} className="jjm-cc" style={cardBase}>
      <span style={iconWrap}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">{icon}</svg>
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
        <span style={labelStyle}>{label}</span>
        <span style={{ fontFamily: "var(--ff-body)", fontSize: label === "EMAIL" ? 14.5 : 16, fontWeight: 600, color: label === "EMAIL" ? "var(--copper-light)" : "var(--text)", overflowWrap: "anywhere" }}>{value}</span>
      </span>
    </a>
  );
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ContactView() {
  const bgRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "", subject: "General Inquiry", message: "" });
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [sentName, setSentName] = useState("");

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY || 0;
        if (bgRef.current) bgRef.current.style.transform = `scale(1.12) translateY(${y * 0.1}px)`;
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setError("");
  };

  const submit = () => {
    if (!form.name.trim()) return setError("Please enter your name.");
    if (!emailRe.test(form.email)) return setError("Please enter a valid email address.");
    if (!form.message.trim()) return setError("Please include a short message.");
    setSentName(form.name.trim().split(" ")[0]);
    setSent(true);
  };

  const reset = () => {
    setForm({ name: "", company: "", email: "", phone: "", subject: "General Inquiry", message: "" });
    setError("");
    setSent(false);
    setSentName("");
  };

  return (
    <div style={{ position: "relative", background: "var(--bg)", minHeight: "100vh", overflowX: "hidden" }}>
      {/* Hero */}
      <section style={{ position: "relative", minHeight: "46vh", display: "flex", alignItems: "flex-end", overflow: "hidden" }}>
        <div ref={bgRef} style={{ position: "absolute", inset: 0, transform: "scale(1.12)", willChange: "transform" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/about.jpg" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.42 }} />
        </div>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 60% at 72% 25%, rgba(184,115,51,0.24), transparent 60%), linear-gradient(180deg, rgba(10,13,15,0.55) 0%, rgba(10,13,15,0.6) 45%, rgba(10,13,15,0.98) 100%)" }} />
        <div style={{ position: "relative", zIndex: 3, width: "100%", maxWidth: 1240, margin: "0 auto", padding: "148px clamp(20px,5vw,72px) 50px" }}>
          <span className="reveal reveal-sm" data-delay="0" style={{ display: "inline-block", fontFamily: "var(--ff-body)", fontSize: 12, fontWeight: 600, letterSpacing: ".22em", textTransform: "uppercase", color: "var(--copper)", marginBottom: 14 }}>Trade Desk</span>
          <h1 className="reveal reveal-sm" data-delay="80" style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: "clamp(40px,7vw,82px)", lineHeight: 1, color: "var(--text)", margin: 0, letterSpacing: "-0.02em" }}>
            Get in <span style={{ background: "linear-gradient(135deg,#E8A87C,#B87333,#7C4A1E)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>Touch</span>
          </h1>
          <p className="reveal reveal-sm" data-delay="180" style={{ fontFamily: "var(--ff-body)", fontSize: "clamp(15px,1.7vw,18px)", lineHeight: 1.7, color: "var(--text-dim)", maxWidth: 560, margin: "20px 0 0" }}>
            Tell us your grade, volume and destination. Our team responds quickly by phone, email or WhatsApp.
          </p>
        </div>
      </section>

      {/* Contact cards + form */}
      <section style={{ position: "relative", zIndex: 5, maxWidth: 1240, margin: "0 auto", padding: "clamp(48px,6vw,80px) clamp(20px,5vw,72px) clamp(36px,4vw,48px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 26, alignItems: "start" }}>
        <div className="reveal" data-delay="0" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <ContactCard href={`tel:${site.phones.uae.tel}`} label="UAE MOBILE" value={site.phones.uae.display} icon={phoneIcon} />
          <ContactCard href={`tel:${site.phones.iraq.tel}`} label="IRAQ MOBILE" value={site.phones.iraq.display} icon={phoneIcon} />
          <ContactCard
            href={`tel:${site.phones.office.tel}`}
            label="DUBAI OFFICE"
            value={site.phones.office.display}
            icon={<path d="M3 7h18v12H3zM3 7l9 6 9-6" stroke="var(--copper-light)" strokeWidth="1.6" strokeLinejoin="round" />}
          />
          <ContactCard
            href={`mailto:${site.email}`}
            label="EMAIL"
            value={site.email}
            icon={
              <>
                <rect x="3" y="5" width="18" height="14" rx="2" stroke="var(--copper-light)" strokeWidth="1.6" />
                <path d="M4 7l8 6 8-6" stroke="var(--copper-light)" strokeWidth="1.6" strokeLinecap="round" />
              </>
            }
          />
          <a
            href={site.whatsapp}
            target="_blank"
            rel="noopener"
            className="wa-cta-card"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 11, textDecoration: "none", padding: 18, borderRadius: 16, background: "linear-gradient(135deg,#25D366,#1faa50)", color: "#fff", fontFamily: "var(--ff-body)", fontSize: 16, fontWeight: 600, boxShadow: "0 12px 30px rgba(37,211,102,0.36)" }}
          >
            <WhatsAppGlyph width={22} height={22} style={{ color: "#fff" }} />
            Chat on WhatsApp
          </a>
        </div>

        {/* Form card */}
        <div className="reveal" data-delay="120" style={{ position: "relative", borderRadius: 22, overflow: "hidden", padding: "clamp(26px,3vw,38px)", background: "linear-gradient(165deg,rgba(26,31,36,0.8),rgba(17,21,24,0.92))", border: "1px solid rgba(184,115,51,0.28)", backdropFilter: "blur(16px)", boxShadow: "0 24px 60px rgba(0,0,0,0.4)" }}>
          {!sent ? (
            <div>
              <h2 style={{ fontFamily: "var(--ff-display)", fontSize: "clamp(24px,3vw,32px)", fontWeight: 700, color: "var(--text)", margin: "0 0 6px" }}>Send an inquiry</h2>
              <p style={{ fontFamily: "var(--ff-body)", fontSize: 14, color: "var(--muted)", margin: "0 0 24px" }}>Fields marked with an asterisk are required.</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 15 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <span style={fieldLabel}>Name *</span>
                  <input className="jjm-field" type="text" placeholder="Your full name" value={form.name} onChange={set("name")} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <span style={fieldLabel}>Company</span>
                  <input className="jjm-field" type="text" placeholder="Company name" value={form.company} onChange={set("company")} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <span style={fieldLabel}>Email *</span>
                  <input className="jjm-field" type="email" placeholder="you@company.com" value={form.email} onChange={set("email")} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <span style={fieldLabel}>Phone</span>
                  <input className="jjm-field" type="tel" placeholder="+971 ..." value={form.phone} onChange={set("phone")} />
                </label>
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 15 }}>
                <span style={fieldLabel}>Subject</span>
                <select className="jjm-field" value={form.subject} onChange={set("subject")}>
                  <option>General Inquiry</option>
                  <option>Copper Products</option>
                  <option>Aluminum Products</option>
                  <option>Lead, Brass &amp; Specialty</option>
                  <option>Insulated Cables</option>
                  <option>Partnership / Other</option>
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 15 }}>
                <span style={fieldLabel}>Message *</span>
                <textarea className="jjm-field" rows={4} placeholder="Tell us the metal, grade, volume and destination port..." value={form.message} onChange={set("message")} />
              </label>
              {error && (
                <div style={{ marginTop: 16, padding: "12px 15px", borderRadius: 11, background: "rgba(220,80,60,0.12)", border: "1px solid rgba(220,80,60,0.4)", color: "#f0a090", fontFamily: "var(--ff-body)", fontSize: 13.5 }}>
                  {error}
                </div>
              )}
              <button
                onClick={submit}
                className="wa-cta-card"
                style={{ marginTop: 20, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, cursor: "pointer", padding: 16, borderRadius: 13, border: "none", background: "var(--copper-gradient)", color: "var(--bg)", fontFamily: "var(--ff-body)", fontSize: 15.5, fontWeight: 700, boxShadow: "0 12px 30px rgba(184,115,51,0.36)" }}
              >
                Send Inquiry
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M4 12l16-8-6 16-2.5-6.5L4 12z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "30px 0" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(37,211,102,0.16)", border: "1px solid rgba(37,211,102,0.5)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#5fe08c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <h3 style={{ fontFamily: "var(--ff-display)", fontSize: 28, fontWeight: 700, color: "var(--text)", margin: "0 0 10px", textAlign: "center" }}>Inquiry received</h3>
              <p style={{ fontFamily: "var(--ff-body)", fontSize: 14.5, lineHeight: 1.65, color: "var(--muted)", margin: "0 0 24px", textAlign: "center", maxWidth: 340 }}>
                Thank you, {sentName} — our trade desk will get back to you shortly. For urgent requests, reach us on WhatsApp.
              </p>
              <button onClick={reset} style={{ cursor: "pointer", padding: "13px 26px", borderRadius: 30, border: "1px solid rgba(184,115,51,0.4)", background: "rgba(184,115,51,0.08)", color: "var(--copper-light)", fontFamily: "var(--ff-body)", fontSize: 14, fontWeight: 600 }}>
                Send another inquiry
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Address cards */}
      <section style={{ position: "relative", zIndex: 5, maxWidth: 1240, margin: "0 auto", padding: "0 clamp(20px,5vw,72px) clamp(64px,9vw,110px)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 22 }}>
          <AddressCard delay="0" title="Dubai Headquarters" lines={site.offices.dubai.lines} maps={site.offices.dubai.maps} />
          <AddressCard delay="120" title="Sulaymaniyah Office" lines={site.offices.iraq.lines} maps={site.offices.iraq.maps} />
        </div>
      </section>
    </div>
  );
}

function AddressCard({ delay, title, lines, maps }: { delay: string; title: string; lines: readonly string[]; maps: string }) {
  return (
    <div className="reveal" data-delay={delay} style={{ borderRadius: 18, padding: 28, background: "linear-gradient(165deg,rgba(26,31,36,0.6),rgba(17,21,24,0.82))", border: "1px solid rgba(184,115,51,0.2)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <span style={{ width: 40, height: 40, borderRadius: 11, background: "rgba(184,115,51,0.16)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 21s-7-5.2-7-11a7 7 0 0 1 14 0c0 5.8-7 11-7 11z" stroke="var(--copper-light)" strokeWidth="1.6" />
            <circle cx="12" cy="10" r="2.4" stroke="var(--copper-light)" strokeWidth="1.6" />
          </svg>
        </span>
        <h3 style={{ fontFamily: "var(--ff-display)", fontSize: 22, fontWeight: 700, color: "var(--text)", margin: 0 }}>{title}</h3>
      </div>
      <p style={{ fontFamily: "var(--ff-body)", fontSize: 14.5, lineHeight: 1.7, color: "var(--text-dim)", margin: "0 0 18px" }}>
        {lines.map((l, i) => (
          <span key={i}>
            {l}
            {i < lines.length - 1 && <br />}
          </span>
        ))}
      </p>
      <a href={maps} target="_blank" rel="noopener" className="map-link" style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", fontFamily: "var(--ff-body)", fontSize: 14, fontWeight: 600, color: "var(--copper-light)" }}>
        View on Google Maps
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M9 7h8v8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </a>
    </div>
  );
}
