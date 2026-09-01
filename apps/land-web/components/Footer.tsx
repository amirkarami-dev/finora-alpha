import Link from "next/link";
import { site } from "@/lib/site";
import { LogoMark, WhatsAppMark, PinIcon } from "./icons";

/**
 * Three columns and a bottom bar: who we are, an index of the site, and every way to reach us.
 *
 * The office addresses sit at the end of the contact column rather than in a fourth column of
 * their own. They are contact details, and a trading company's address is not something to drop
 * for symmetry — it is what a buyer checks before wiring money, and what a search engine reads
 * to place the business.
 */

const colHead = {
  fontFamily: "var(--ff-body)",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: ".2em",
  color: "var(--accent)",
  textTransform: "uppercase" as const,
  margin: "0 0 22px",
};

const linkStyle = {
  textDecoration: "none",
  fontFamily: "var(--ff-body)",
  fontSize: 14,
  color: "var(--text-dim)",
};

const indexLinks = [
  { label: "Home", href: "/" },
  { label: "Copper Products", href: "/copper" },
  { label: "Aluminum Products", href: "/aluminum" },
  { label: "Other Products", href: "/other-products" },
  { label: "Industries", href: "/industries" },
  { label: "About Us", href: "/about-us" },
  { label: "Contact", href: "/contact" },
];

function ContactRow({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <a
      href={href}
      className="link-hover"
      style={{ textDecoration: "none", display: "flex", flexDirection: "column", gap: 2 }}
    >
      <span style={{ fontFamily: "var(--ff-body)", fontSize: 11, color: "#6f675f", letterSpacing: ".08em" }}>
        {label}
      </span>
      <span style={{ fontFamily: "var(--ff-body)", fontSize: 14.5, color: "var(--text)", fontWeight: 500 }}>
        {value}
      </span>
    </a>
  );
}

function OfficeRow({ name, lines, maps }: { name: string; lines: readonly string[]; maps: string }) {
  return (
    <a
      href={maps}
      target="_blank"
      rel="noopener"
      className="map-link"
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        textDecoration: "none",
        color: "var(--muted)",
      }}
    >
      <PinIcon width={15} height={15} style={{ marginTop: 3, flex: "0 0 auto", color: "var(--copper)" }} />
      <span>
        <span
          style={{
            display: "block",
            fontFamily: "var(--ff-body)",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text)",
            marginBottom: 3,
          }}
        >
          {name}
        </span>
        <span
          style={{
            display: "block",
            fontFamily: "var(--ff-body)",
            fontSize: 12.5,
            lineHeight: 1.6,
          }}
        >
          {lines.map((l, i) => (
            <span key={i}>
              {l}
              {i < lines.length - 1 && <br />}
            </span>
          ))}
        </span>
      </span>
    </a>
  );
}

export default function Footer() {
  // Read at render rather than typed in: the footer this replaces said 2025, and had been wrong
  // since January.
  const year = new Date().getFullYear();

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
        aria-hidden
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
          gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
          gap: "clamp(32px,4vw,64px)",
          alignItems: "start",
        }}
      >
        {/* Brand */}
        <div>
          <Link
            href="/"
            style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", marginBottom: 18 }}
          >
            <LogoMark size={40} />
            <span style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
              <span style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: 20, color: "var(--text)" }}>
                {site.shortName}
              </span>
              <span
                style={{
                  fontFamily: "var(--ff-body)",
                  fontWeight: 500,
                  fontSize: 9.5,
                  color: "var(--accent)",
                  letterSpacing: ".26em",
                  marginTop: 3,
                }}
              >
                METALS&nbsp;TRADING&nbsp;L.L.C.
              </span>
            </span>
          </Link>

          <p
            style={{
              fontFamily: "var(--ff-body)",
              fontSize: 14,
              lineHeight: 1.7,
              color: "var(--muted)",
              maxWidth: 320,
              margin: "0 0 22px",
            }}
          >
            Sourcing, processing &amp; exporting premium non-ferrous metals across the Persian Gulf,
            Middle East, China &amp; India.
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

        {/* Index */}
        <nav aria-label="Footer">
          <h4 style={colHead}>Index</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            {indexLinks.map((l) => (
              <Link key={l.href} href={l.href} className="link-hover" style={linkStyle}>
                {l.label}
              </Link>
            ))}
          </div>
        </nav>

        {/* Contact */}
        <div>
          <h4 style={colHead}>Contact</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <ContactRow
              label={site.phones.uae.label}
              value={site.phones.uae.display}
              href={`tel:${site.phones.uae.tel}`}
            />
            <ContactRow
              label={site.phones.iraq.label}
              value={site.phones.iraq.display}
              href={`tel:${site.phones.iraq.tel}`}
            />
            <ContactRow
              label={site.phones.office.label}
              value={site.phones.office.display}
              href={`tel:${site.phones.office.tel}`}
            />
            <ContactRow label="EMAIL" value={site.email} href={`mailto:${site.email}`} />

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
                marginTop: 8,
                paddingTop: 18,
                borderTop: "1px solid rgba(184,115,51,0.14)",
              }}
            >
              <OfficeRow {...site.offices.dubai} />
              <OfficeRow {...site.offices.iraq} />
            </div>
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
          © {year} {site.company} — all rights reserved.
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--ff-body)", fontSize: 12.5, color: "var(--muted)" }}>metal-uae.com</span>

          {/* Kept from the footer this replaces: of the three links that lived down here, it is the
              only one that went anywhere. The other two pointed at "#". */}
          <a
            href={site.erp}
            target="_blank"
            rel="noopener"
            className="link-hover-erp"
            style={{
              textDecoration: "none",
              fontFamily: "var(--ff-body)",
              fontSize: 12,
              color: "#5d564f",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            ERP Portal
          </a>

          {/* No script and no motion opt-out of its own: globals.css already sets
              scroll-behavior: smooth, and already turns it off under prefers-reduced-motion. */}
          <a
            href="#top"
            className="link-hover"
            style={{ ...linkStyle, fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            Top
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 19V5M5 12l7-7 7 7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </div>
      </div>
    </footer>
  );
}
