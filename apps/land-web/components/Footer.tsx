import Link from "next/link";
import { site } from "@/lib/site";
import { LogoMark, WhatsAppMark, PinIcon } from "./icons";

const colHead = {
  fontFamily: "var(--ff-body)",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: ".2em",
  color: "var(--accent)",
  textTransform: "uppercase" as const,
  margin: "0 0 20px",
};

const exploreLinks = [
  { label: "Home", href: "/" },
  { label: "Copper Products", href: "/copper" },
  { label: "Aluminum Products", href: "/aluminum" },
  { label: "Other Products", href: "/other-products" },
  { label: "Industries", href: "/industries" },
  { label: "About Us", href: "/about-us" },
];

function PhoneRow({ label, display, tel }: { label: string; display: string; tel: string }) {
  return (
    <a href={`tel:${tel}`} style={{ textDecoration: "none", display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontFamily: "var(--ff-body)", fontSize: 11, color: "#6f675f", letterSpacing: ".08em" }}>{label}</span>
      <span style={{ fontFamily: "var(--ff-body)", fontSize: 14.5, color: "var(--text)", fontWeight: 500 }}>{display}</span>
    </a>
  );
}

function OfficeRow({ name, lines }: { name: string; lines: readonly string[] }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <PinIcon width={16} height={16} style={{ marginTop: 2, flex: "0 0 auto", color: "var(--copper)" }} />
      <div>
        <div style={{ fontFamily: "var(--ff-body)", fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 3 }}>{name}</div>
        <div style={{ fontFamily: "var(--ff-body)", fontSize: 12.5, lineHeight: 1.6, color: "var(--muted)" }}>
          {lines.map((l, i) => (
            <span key={i}>
              {l}
              {i < lines.length - 1 && <br />}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Footer() {
  return (
    <footer
      style={{
        position: "relative",
        background: "linear-gradient(180deg,#0A0D0F,#080A0B)",
        borderTop: "1px solid rgba(184,115,51,0.22)",
        padding: "clamp(48px,7vw,84px) clamp(18px,5vw,72px) 30px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -120,
          left: "50%",
          transform: "translateX(-50%)",
          width: 680,
          height: 240,
          background: "radial-gradient(ellipse at center, rgba(184,115,51,0.16), transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          maxWidth: 1240,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
          gap: "clamp(32px,4vw,56px)",
        }}
      >
        {/* Brand column */}
        <div style={{ gridColumn: "span 1", minWidth: 240 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", marginBottom: 18 }}>
            <LogoMark size={40} />
            <span style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
              <span style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: 20, color: "var(--text)" }}>{site.shortName}</span>
              <span style={{ fontFamily: "var(--ff-body)", fontWeight: 500, fontSize: 9.5, color: "var(--accent)", letterSpacing: ".26em", marginTop: 3 }}>
                METALS&nbsp;TRADING&nbsp;L.L.C.
              </span>
            </span>
          </Link>
          <p style={{ fontFamily: "var(--ff-body)", fontSize: 14, lineHeight: 1.7, color: "var(--muted)", maxWidth: 300, margin: "0 0 20px" }}>
            Sourcing, processing &amp; exporting premium non-ferrous metals across the Persian Gulf, Middle East, China &amp; India.
          </p>
          <a
            href={site.whatsapp}
            target="_blank"
            rel="noopener"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 9,
              textDecoration: "none",
              background: "rgba(37,211,102,0.12)",
              border: "1px solid rgba(37,211,102,0.4)",
              color: "#5fe08c",
              fontFamily: "var(--ff-body)",
              fontSize: 13.5,
              fontWeight: 600,
              padding: "9px 16px",
              borderRadius: 30,
            }}
          >
            <WhatsAppMark width={17} height={17} style={{ color: "#5fe08c" }} />
            WhatsApp Us
          </a>
        </div>

        {/* Explore */}
        <div>
          <h4 style={colHead}>Explore</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            {exploreLinks.map((l) => (
              <Link key={l.href} href={l.href} className="link-hover" style={{ textDecoration: "none", fontFamily: "var(--ff-body)", fontSize: 14, color: "var(--text-dim)" }}>
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Contact */}
        <div>
          <h4 style={colHead}>Contact</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <PhoneRow {...site.phones.uae} />
            <PhoneRow {...site.phones.iraq} />
            <PhoneRow {...site.phones.office} />
            <a href={`mailto:${site.email}`} style={{ textDecoration: "none", display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontFamily: "var(--ff-body)", fontSize: 11, color: "#6f675f", letterSpacing: ".08em" }}>EMAIL</span>
              <span style={{ fontFamily: "var(--ff-body)", fontSize: 14, color: "var(--copper-light)", fontWeight: 500 }}>{site.email}</span>
            </a>
          </div>
        </div>

        {/* Offices */}
        <div>
          <h4 style={colHead}>Offices</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <OfficeRow name={site.offices.dubai.name} lines={site.offices.dubai.lines} />
            <OfficeRow name={site.offices.iraq.name} lines={site.offices.iraq.lines} />
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div
        style={{
          position: "relative",
          maxWidth: 1240,
          margin: "clamp(40px,5vw,56px) auto 0",
          paddingTop: 26,
          borderTop: "1px solid rgba(184,115,51,0.16)",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <span style={{ fontFamily: "var(--ff-body)", fontSize: 12.5, color: "#6f675f" }}>
          © 2025 Jalil Jalal Metal Trading L.L.C. All rights reserved.
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
          <a href="#" className="link-hover" style={{ textDecoration: "none", fontFamily: "var(--ff-body)", fontSize: 12.5, color: "var(--muted)" }}>
            Privacy Policy
          </a>
          <a href="#" className="link-hover" style={{ textDecoration: "none", fontFamily: "var(--ff-body)", fontSize: 12.5, color: "var(--muted)" }}>
            Terms &amp; Conditions
          </a>
          <a
            href={site.erp}
            target="_blank"
            rel="noopener"
            className="link-hover-erp"
            style={{ textDecoration: "none", fontFamily: "var(--ff-body)", fontSize: 12, color: "#5d564f", display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            ERP Portal
          </a>
        </div>
      </div>
    </footer>
  );
}
