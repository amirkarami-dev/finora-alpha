import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "@/components/icons";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Jalil Jalal Metals Trading L.L.C. — a UAE-based trader and exporter of non-ferrous metals, with dual-base operations in Dubai and Sulaymaniyah serving the Gulf, China and India.",
};

const accent = {
  background: "linear-gradient(135deg,#E8A87C,#B87333,#7C4A1E)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
} as const;

const eyebrow = { fontFamily: "var(--ff-body)", fontSize: 12, fontWeight: 600, letterSpacing: ".22em", textTransform: "uppercase" as const, color: "var(--copper)" };

const whyCards = [
  {
    title: "Trusted Exporter",
    desc: "A registered UAE trading house with established export channels across the Gulf, China and India.",
    icon: (
      <>
        <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z" stroke="#E8A87C" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M9 12l2 2 4-4" stroke="#E8A87C" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    delay: "0",
  },
  {
    title: "Product Quality",
    desc: "Every consignment is sorted, graded and quality-checked to meet international buyer specifications.",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" stroke="#E8A87C" strokeWidth="1.6" />
        <path d="M8 12l2.5 2.5L16 9" stroke="#E8A87C" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    delay: "100",
  },
  {
    title: "Custom Packaging",
    desc: "Big bags, drums, bundles or container-loose — packed and labelled to your shipping requirements.",
    icon: (
      <>
        <path d="M3 8l9-5 9 5v8l-9 5-9-5V8z" stroke="#E8A87C" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M3 8l9 5 9-5M12 13v8" stroke="#E8A87C" strokeWidth="1.6" strokeLinejoin="round" />
      </>
    ),
    delay: "200",
  },
  {
    title: "Ready Supply",
    desc: "Consistent stock and fast turnaround keep your foundry or production line continuously fed.",
    icon: (
      <>
        <path d="M1 4h14v10H1zM15 8h4l4 4v2h-8" stroke="#E8A87C" strokeWidth="1.6" strokeLinejoin="round" />
        <circle cx="6" cy="17" r="2" stroke="#E8A87C" strokeWidth="1.6" />
        <circle cx="18" cy="17" r="2" stroke="#E8A87C" strokeWidth="1.6" />
      </>
    ),
    delay: "300",
  },
];

const regions = ["UAE", "Iraq", "Persian Gulf", "China", "India", "Middle East"];

const tableRows = [
  { cat: "Copper", products: "Wire scrap, bus bar, granules, rod, billets, ingots, Millberry, Cliff", forms: "Scrap · Cast · Rod" },
  { cat: "Aluminum", products: "Ingots, granules, pressed bales, UBC scrap", forms: "Ingot · Granule · Bale" },
  { cat: "Lead", products: "Industrial ingots, cast pyramids", forms: "Refined ingot" },
  { cat: "Brass", products: "Honey & mixed brass scrap", forms: "Sorted scrap" },
  { cat: "Cables", products: "Insulated copper power cables", forms: "Recoverable Cu" },
];

const th = { textAlign: "left" as const, padding: "18px 24px", fontFamily: "var(--ff-body)", fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase" as const, color: "var(--text)" };

export default function AboutPage() {
  return (
    <div style={{ position: "relative", background: "var(--bg)", minHeight: "100vh", overflowX: "hidden" }}>
      {/* SPLIT HERO */}
      <section style={{ position: "relative", padding: "clamp(130px,16vw,180px) clamp(20px,5vw,72px) clamp(40px,6vw,72px)", maxWidth: 1240, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: "clamp(36px,5vw,64px)", alignItems: "center" }}>
          <div>
            <span className="reveal reveal-sm" data-delay="0" style={{ ...eyebrow, display: "inline-block", marginBottom: 16 }}>Our Story</span>
            <h1 className="reveal reveal-sm" data-delay="80" style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: "clamp(40px,6.5vw,76px)", lineHeight: 1, color: "var(--text)", margin: "0 0 22px", letterSpacing: "-0.02em" }}>
              About <span style={accent}>Us</span>
            </h1>
            <p className="reveal reveal-sm" data-delay="160" style={{ fontFamily: "var(--ff-body)", fontSize: "clamp(15.5px,1.7vw,18px)", lineHeight: 1.78, color: "var(--text-dim)", margin: 0 }}>
              Jalil Jalal Metals Trading L.L.C. is a UAE-based company engaged in the trading and export of non-ferrous metals such as copper, aluminum, lead, brass, and related products. With a strong footprint in the Persian Gulf, Middle East, China, India, and beyond, we supply high-quality materials to foundries, manufacturers, and recyclers.
            </p>
          </div>
          <div className="reveal" data-delay="220" style={{ position: "relative" }}>
            <div style={{ position: "relative", borderRadius: 22, overflow: "hidden", aspectRatio: "4/5", background: "var(--copper-gradient)", boxShadow: "0 30px 70px rgba(0,0,0,0.5)", border: "1px solid rgba(184,115,51,0.3)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/about.jpg" alt="Jalil Jalal Metals operations" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.95 }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg,rgba(10,13,15,0) 45%,rgba(10,13,15,0.55))" }} />
            </div>
            <div style={{ position: "absolute", bottom: -22, left: -20, padding: "18px 22px", borderRadius: 16, background: "rgba(17,21,24,0.92)", backdropFilter: "blur(14px)", border: "1px solid rgba(184,115,51,0.34)", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
              <div style={{ fontFamily: "var(--ff-display)", fontSize: 26, fontWeight: 700, color: "var(--copper-light)", lineHeight: 1 }}>Dubai · Iraq</div>
              <div style={{ fontFamily: "var(--ff-body)", fontSize: 12.5, color: "var(--muted)", marginTop: 5 }}>dual-base operations</div>
            </div>
          </div>
        </div>
      </section>

      {/* MISSION QUOTE */}
      <section style={{ position: "relative", zIndex: 5, maxWidth: 1100, margin: "0 auto", padding: "clamp(30px,5vw,60px) clamp(20px,5vw,72px)" }}>
        <div className="reveal" data-delay="0" style={{ position: "relative", borderRadius: 24, padding: "clamp(40px,6vw,68px) clamp(28px,5vw,64px)", background: "linear-gradient(150deg,rgba(124,74,30,0.32),rgba(17,21,24,0.6))", border: "1px solid rgba(184,115,51,0.3)", overflow: "hidden" }}>
          <span style={{ position: "absolute", top: 10, left: 30, fontFamily: "var(--ff-display)", fontSize: 160, lineHeight: 1, color: "rgba(184,115,51,0.18)" }}>&ldquo;</span>
          <span style={{ ...eyebrow, position: "relative" }}>Our Mission</span>
          <p style={{ position: "relative", fontFamily: "var(--ff-display)", fontStyle: "italic", fontWeight: 500, fontSize: "clamp(24px,3.6vw,40px)", lineHeight: 1.32, color: "var(--text)", margin: "18px 0 0" }}>
            To deliver clean, reliable, and consistent metal solutions through transparent trade practices and efficient service.
          </p>
        </div>
      </section>

      {/* WHY CHOOSE US */}
      <section style={{ position: "relative", zIndex: 5, maxWidth: 1240, margin: "0 auto", padding: "clamp(40px,6vw,80px) clamp(20px,5vw,72px)" }}>
        <div className="reveal" data-delay="0" style={{ textAlign: "center", maxWidth: 600, margin: "0 auto clamp(36px,5vw,52px)" }}>
          <span style={eyebrow}>Why Choose Us</span>
          <h2 style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: "clamp(28px,4.2vw,44px)", color: "var(--text)", lineHeight: 1.1, margin: "14px 0 0" }}>What sets our trade apart</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 20 }}>
          {whyCards.map((c) => (
            <div key={c.title} className="reveal" data-delay={c.delay} style={{ padding: "30px 26px", borderRadius: 18, background: "linear-gradient(165deg,rgba(26,31,36,0.6),rgba(17,21,24,0.8))", border: "1px solid rgba(184,115,51,0.2)" }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: "rgba(184,115,51,0.14)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none">{c.icon}</svg>
              </div>
              <h3 style={{ fontFamily: "var(--ff-display)", fontSize: 20, fontWeight: 600, color: "var(--text)", margin: "0 0 9px" }}>{c.title}</h3>
              <p style={{ fontFamily: "var(--ff-body)", fontSize: 13.5, lineHeight: 1.65, color: "var(--muted)", margin: 0 }}>{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* REGIONS */}
      <section style={{ position: "relative", zIndex: 5, maxWidth: 1240, margin: "0 auto", padding: "clamp(30px,5vw,60px) clamp(20px,5vw,72px)" }}>
        <div className="reveal" data-delay="0" style={{ borderRadius: 22, padding: "clamp(34px,5vw,52px)", background: "linear-gradient(165deg,rgba(26,31,36,0.55),rgba(17,21,24,0.78))", border: "1px solid rgba(184,115,51,0.2)", textAlign: "center" }}>
          <span style={eyebrow}>Regions Served</span>
          <h2 style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: "clamp(26px,3.6vw,38px)", color: "var(--text)", margin: "14px 0 26px" }}>A truly cross-border supply network</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 13, justifyContent: "center" }}>
            {regions.map((r) => (
              <span key={r} style={{ display: "inline-flex", alignItems: "center", gap: 9, fontFamily: "var(--ff-body)", fontSize: 15, fontWeight: 600, color: "var(--text)", padding: "12px 22px", borderRadius: 34, border: "1px solid rgba(184,115,51,0.34)", background: "rgba(184,115,51,0.08)" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--copper-light)", boxShadow: "0 0 8px #E8A87C" }} />
                {r}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* PRODUCT OVERVIEW TABLE */}
      <section style={{ position: "relative", zIndex: 5, maxWidth: 1240, margin: "0 auto", padding: "clamp(40px,6vw,80px) clamp(20px,5vw,72px)" }}>
        <div className="reveal" data-delay="0" style={{ textAlign: "center", maxWidth: 600, margin: "0 auto clamp(32px,4vw,48px)" }}>
          <span style={eyebrow}>Product Overview</span>
          <h2 style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: "clamp(28px,4.2vw,44px)", color: "var(--text)", lineHeight: 1.1, margin: "14px 0 0" }}>Everything we trade, at a glance</h2>
        </div>
        <div className="reveal" data-delay="100" style={{ borderRadius: 18, overflow: "hidden", border: "1px solid rgba(184,115,51,0.22)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
            <thead>
              <tr style={{ background: "linear-gradient(135deg,rgba(124,74,30,0.55),rgba(184,115,51,0.35))" }}>
                <th style={th}>Category</th>
                <th style={th}>Key Products</th>
                <th style={th}>Typical Forms</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, i) => (
                <tr key={row.cat} className="jjm-trow" style={{ borderTop: "1px solid rgba(184,115,51,0.14)", background: i % 2 === 1 ? "rgba(255,255,255,0.015)" : undefined }}>
                  <td style={{ padding: "18px 24px", fontFamily: "var(--ff-display)", fontSize: 18, fontWeight: 600, color: "var(--copper-light)" }}>{row.cat}</td>
                  <td style={{ padding: "18px 24px", fontFamily: "var(--ff-body)", fontSize: 14, color: "var(--text-dim)", lineHeight: 1.55 }}>{row.products}</td>
                  <td style={{ padding: "18px 24px", fontFamily: "var(--ff-body)", fontSize: 13.5, color: "var(--muted)" }}>{row.forms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* CLOSING */}
      <section style={{ position: "relative", zIndex: 5, padding: "clamp(30px,5vw,60px) clamp(20px,5vw,72px) clamp(60px,8vw,100px)" }}>
        <div className="reveal" data-delay="0" style={{ position: "relative", maxWidth: 1100, margin: "0 auto", borderRadius: 26, overflow: "hidden", padding: "clamp(44px,6vw,80px) clamp(28px,5vw,64px)", background: "linear-gradient(120deg,#7C4A1E,#B87333,#E8A87C)", textAlign: "center" }}>
          <div style={{ position: "absolute", inset: 0, opacity: 0.12, backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
          <h2 style={{ position: "relative", fontFamily: "var(--ff-display)", fontWeight: 700, fontStyle: "italic", fontSize: "clamp(26px,4.2vw,44px)", color: "#1a120b", lineHeight: 1.22, margin: "0 auto", maxWidth: 760 }}>
            Let&apos;s build a more sustainable metal supply chain — together.
          </h2>
          <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 9, marginTop: 22, fontFamily: "var(--ff-body)", fontSize: 14.5, fontWeight: 600, color: "rgba(26,18,11,0.85)" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <path d="M12 21s-7-5.2-7-11a7 7 0 0 1 14 0c0 5.8-7 11-7 11z" stroke="#1a120b" strokeWidth="1.8" />
              <circle cx="12" cy="10" r="2.4" stroke="#1a120b" strokeWidth="1.8" />
            </svg>
            Headquartered in Dubai, UAE
          </div>
          <div style={{ position: "relative", marginTop: 30 }}>
            <Link href="/contact" className="btn-dark" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", padding: "16px 34px", borderRadius: 34, background: "var(--bg)", color: "var(--text)", fontFamily: "var(--ff-body)", fontSize: 15.5, fontWeight: 600, boxShadow: "0 14px 34px rgba(0,0,0,0.35)" }}>
              Start a Conversation <ArrowRight width={17} height={17} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
