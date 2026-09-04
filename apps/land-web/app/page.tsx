"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "@/components/icons";
import SourcingVideo from "@/components/SourcingVideo";

const accentGradient = {
  background: "linear-gradient(135deg,#E8A87C,#B87333,#7C4A1E)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
} as const;

const statGradient = {
  fontFamily: "var(--ff-display)",
  fontWeight: 700,
  fontSize: "clamp(40px,6vw,62px)",
  background: "linear-gradient(135deg,#E8A87C,#B87333)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
  lineHeight: 1,
} as const;

const heroWord = { display: "inline-block" } as const;

const usps = ["Quality Checked", "Export Ready", "Custom Packaging", "Fast Turnaround"];

const bento = [
  {
    href: "/copper",
    img: "/assets/products/stock-05.jpeg",
    overlay: "linear-gradient(180deg,rgba(10,13,15,0.1),rgba(124,74,30,0.35) 55%,rgba(10,13,15,0.92))",
    eyebrow: "01 — Copper",
    eyebrowColor: "#E8A87C",
    title: "Copper Products",
    desc: "Wire scrap, bus bar, granules, rod, billets & ingots — high-purity copper in every form.",
    delay: "0",
  },
  {
    href: "/aluminum",
    img: "/assets/products/stock-02.jpeg",
    // Aluminum's texture is much brighter than the others — ramp to a strong
    // dark scrim by ~60% so the eyebrow + title stay legible over the bars.
    overlay: "linear-gradient(180deg,rgba(10,13,15,0.12) 0%,rgba(26,32,38,0.45) 38%,rgba(10,13,15,0.88) 62%,rgba(10,13,15,0.96) 100%)",
    eyebrow: "02 — Aluminum",
    eyebrowColor: "#C9CDD2",
    title: "Aluminum Products",
    desc: "Ingots, granules, pressed bales & UBC scrap — consistent, foundry-ready aluminum.",
    delay: "120",
  },
  {
    href: "/other-products",
    img: "/assets/products/stock-07.jpeg",
    overlay: "linear-gradient(180deg,rgba(10,13,15,0.1),rgba(90,70,40,0.35) 55%,rgba(10,13,15,0.92))",
    eyebrow: "03 — Specialty",
    eyebrowColor: "#E8A87C",
    title: "Other Products",
    desc: "Lead ingots & pyramids, brass scrap and insulated copper power cables.",
    delay: "240",
  },
];

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

export default function Home() {
  const [stats, setStats] = useState({ countries: 0, products: 0, clients: 0, years: 0 });
  const heroBg = useRef<HTMLDivElement>(null);
  const heroContent = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const statsRun = useRef(false);

  useEffect(() => {
    const runStats = () => {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const T = { countries: 15, products: 16, clients: 100, years: 5 };
      if (reduce) {
        setStats(T);
        return;
      }
      const dur = 1500;
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        setStats({
          countries: Math.round(T.countries * e),
          products: Math.round(T.products * e),
          clients: Math.round(T.clients * e),
          years: Math.round(T.years * e),
        });
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    let ticking = false;
    const onScroll = () => {
      const vh = window.innerHeight || 800;
      if (statsRef.current && !statsRun.current && statsRef.current.getBoundingClientRect().top < vh * 0.85) {
        statsRun.current = true;
        runStats();
      }
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY || window.pageYOffset;
        if (heroBg.current) heroBg.current.style.transform = `scale(1.18) translateY(${y * 0.16}px)`;
        if (heroContent.current) {
          heroContent.current.style.transform = `translateY(${y * 0.1}px)`;
          heroContent.current.style.opacity = String(Math.max(0, 1 - y / 640));
        }
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div style={{ position: "relative", background: "var(--bg)", minHeight: "100vh", overflowX: "hidden" }}>
      <div className="grain-overlay" />

      {/* ============ HERO ============ */}
      <section style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", overflow: "hidden" }}>
        <div ref={heroBg} style={{ position: "absolute", inset: 0, background: "linear-gradient(115deg,#0a0d0f 0%,#1d252b 48%,#3c2415 100%)", transform: "scale(1.18)", willChange: "transform" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/hero.jpg" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.38, filter: "saturate(0.78) contrast(1.12) brightness(0.88)" }} />
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 58% 70% at 76% 42%, rgba(184,115,51,0.28), transparent 68%), radial-gradient(ellipse 70% 80% at 20% 35%, rgba(111,132,145,0.16), transparent 64%), linear-gradient(180deg, rgba(10,13,15,0.5) 0%, rgba(10,13,15,0.34) 40%, rgba(10,13,15,0.96) 100%)",
          }}
        />
        <div style={{ position: "absolute", bottom: -80, left: -60, width: 420, height: 420, background: "radial-gradient(circle, rgba(124,74,30,0.35), transparent 70%)", pointerEvents: "none" }} />

        <div ref={heroContent} className="hero-content" style={{ position: "relative", zIndex: 3, width: "100%", maxWidth: 1240, margin: "0 auto", padding: "120px clamp(20px,5vw,72px) 60px", willChange: "transform" }}>
          <div className="hero-copy">
          <span
            className="reveal reveal-sm"
            data-delay="40"
            style={{ display: "inline-flex", alignItems: "center", gap: 9, fontFamily: "var(--ff-body)", fontSize: 12.5, fontWeight: 500, letterSpacing: ".22em", textTransform: "uppercase", color: "var(--accent)", padding: "8px 16px", border: "1px solid rgba(184,115,51,0.4)", borderRadius: 30, background: "rgba(184,115,51,0.08)", backdropFilter: "blur(8px)" }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--copper-light)", boxShadow: "0 0 10px #E8A87C" }} />
            Dubai · Iraq · Worldwide Non-Ferrous Metals Trade
          </span>

          <h1 className="hero-title" style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: "clamp(46px,9vw,112px)", lineHeight: 0.98, color: "var(--text)", margin: "26px 0 0", letterSpacing: "-0.02em" }}>
            <span className="reveal reveal-sm" data-delay="80" style={heroWord}>Metal</span>
            <span className="reveal reveal-sm" data-delay="180" style={heroWord}>&nbsp;is</span>
            <span className="reveal reveal-sm" data-delay="280" style={heroWord}>&nbsp;Our</span>
            <span className="reveal reveal-sm" data-delay="380" style={{ ...heroWord, ...accentGradient }}>&nbsp;Craft</span>
          </h1>
          <p className="hero-subtitle reveal reveal-sm" data-delay="480" style={{ fontFamily: "var(--ff-display)", fontStyle: "italic", fontWeight: 500, fontSize: "clamp(24px,4.5vw,46px)", color: "var(--accent)", margin: "6px 0 0" }}>
            Trust is Our Core
          </p>

          <p className="hero-description reveal reveal-sm" data-delay="560" style={{ fontFamily: "var(--ff-body)", fontSize: "clamp(15px,1.7vw,18px)", lineHeight: 1.75, color: "#C8BFB5", maxWidth: 560, margin: "26px 0 0" }}>
            We source, process and export copper, aluminum, lead and brass to foundries, manufacturers and recyclers across the Gulf and beyond — clean material, transparent trade, dependable supply.
          </p>

          <div className="hero-actions reveal reveal-sm" data-delay="640" style={{ display: "flex", flexWrap: "wrap", gap: 15, marginTop: 38 }}>
            <Link href="/copper" className="btn-copper" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", padding: "16px 30px", borderRadius: 34, background: "var(--copper-gradient)", color: "var(--bg)", fontFamily: "var(--ff-body)", fontSize: 15.5, fontWeight: 700, boxShadow: "0 14px 36px rgba(184,115,51,0.42)" }}>
              Explore Products
              <ArrowRight width={17} height={17} />
            </Link>
            <Link href="/about-us" className="btn-ghost" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", padding: "16px 30px", borderRadius: 34, border: "1px solid rgba(245,240,235,0.28)", color: "var(--text)", fontFamily: "var(--ff-body)", fontSize: 15.5, fontWeight: 600, background: "rgba(245,240,235,0.03)", backdropFilter: "blur(8px)" }}>
              About Us
            </Link>
          </div>
          </div>
          <div className="hero-video-stack reveal reveal-sm" data-delay="360">
            <div className="hero-brand-stamp" aria-label="Jalil Jalal Company">
              <span>Jalil Jalal Company</span>
              <i aria-hidden="true" />
            </div>
            <SourcingVideo src="/assets/videos/processing-heat-exchangers.mp4" caption="Heat exchange processing" />
            <div className="hero-video-secondary">
              <video src="/assets/videos/copper-wires.mp4" autoPlay muted loop playsInline preload="metadata" aria-label="Camera gliding over copper wires" />
              <span>Copper in motion</span>
            </div>
          </div>
        </div>

        <div className="reveal reveal-sm" data-delay="820" style={{ position: "absolute", bottom: 30, left: "50%", marginLeft: -20, zIndex: 3, display: "flex", flexDirection: "column", alignItems: "center", gap: 9 }}>
          <span style={{ fontFamily: "var(--ff-body)", fontSize: 10.5, letterSpacing: ".24em", textTransform: "uppercase", color: "var(--muted)" }}>Scroll</span>
          <div style={{ width: 1, height: 46, background: "linear-gradient(180deg,#B87333,transparent)" }} />
        </div>
      </section>

      {/* ============ STATS BAR ============ */}
      <section ref={statsRef} style={{ position: "relative", zIndex: 5, marginTop: -1, background: "linear-gradient(180deg,#0A0D0F,#0e1114)", borderTop: "1px solid rgba(184,115,51,0.18)", borderBottom: "1px solid rgba(184,115,51,0.18)" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "clamp(32px,5vw,52px) clamp(20px,5vw,72px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 24 }}>
          {[
            { v: stats.countries, label: "Countries Served", d: "0" },
            { v: stats.products, label: "Product Types", d: "100" },
            { v: stats.clients, label: "Active Clients", d: "200" },
            { v: stats.years, label: "Years of Trade", d: "300" },
          ].map((s) => (
            <div key={s.label} className="reveal" data-delay={s.d} style={{ textAlign: "center" }}>
              <div style={statGradient}>{s.v}+</div>
              <div style={{ fontFamily: "var(--ff-body)", fontSize: 13.5, fontWeight: 500, letterSpacing: ".04em", color: "var(--muted)", marginTop: 10 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ============ WELCOME ============ */}
      <section style={{ position: "relative", zIndex: 5, maxWidth: 1240, margin: "0 auto", padding: "clamp(64px,9vw,120px) clamp(20px,5vw,72px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: "clamp(40px,5vw,72px)", alignItems: "center" }}>
        <div className="reveal" data-delay="0">
          <span style={{ fontFamily: "var(--ff-body)", fontSize: 12, fontWeight: 600, letterSpacing: ".22em", textTransform: "uppercase", color: "var(--copper)" }}>Who We Are</span>
          <h2 style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: "clamp(30px,4.5vw,48px)", color: "var(--text)", lineHeight: 1.1, margin: "16px 0 20px" }}>A trusted name in non-ferrous metals trade</h2>
          <p style={{ fontFamily: "var(--ff-body)", fontSize: 15.5, lineHeight: 1.78, color: "var(--muted)", margin: "0 0 18px" }}>
            Jalil Jalal Metals Trading L.L.C. is a UAE-based company engaged in the trading and export of non-ferrous metals — copper, aluminum, lead, brass and related products. From our base in Dubai and operations in Sulaymaniyah, we deliver consistent grade and reliable logistics.
          </p>
          <p style={{ fontFamily: "var(--ff-body)", fontSize: 15.5, lineHeight: 1.78, color: "var(--muted)", margin: "0 0 28px" }}>
            We supply high-quality materials to foundries, manufacturers and recyclers across the Persian Gulf, Middle East, China and India.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 11 }}>
            {usps.map((u) => (
              <span key={u} style={{ fontFamily: "var(--ff-body)", fontSize: 13, fontWeight: 500, color: "var(--copper-light)", padding: "9px 17px", borderRadius: 30, border: "1px solid rgba(184,115,51,0.34)", background: "rgba(184,115,51,0.07)" }}>{u}</span>
            ))}
          </div>
        </div>
        <div className="reveal" data-delay="150" style={{ position: "relative" }}>
          <div style={{ position: "relative", borderRadius: 22, overflow: "hidden", aspectRatio: "4/5", background: "var(--copper-gradient)", boxShadow: "0 30px 70px rgba(0,0,0,0.5)", border: "1px solid rgba(184,115,51,0.3)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/iso-certified-metal.jpg" alt="ISO-certified quality assurance for industrial metal processing" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", opacity: 0.92 }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg,rgba(10,13,15,0) 50%,rgba(10,13,15,0.5))" }} />
          </div>
          <div style={{ position: "absolute", bottom: -22, left: -22, padding: "20px 24px", borderRadius: 16, background: "rgba(17,21,24,0.92)", backdropFilter: "blur(14px)", border: "1px solid rgba(184,115,51,0.34)", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
            <div style={{ fontFamily: "var(--ff-display)", fontSize: 30, fontWeight: 700, color: "var(--copper-light)", lineHeight: 1 }}>ISO-grade</div>
            <div style={{ fontFamily: "var(--ff-body)", fontSize: 12.5, color: "var(--muted)", marginTop: 5 }}>quality-checked material</div>
          </div>
        </div>
      </section>

      {/* ============ FROM THE YARD (video) ============ */}
      <section style={{ position: "relative", zIndex: 5, background: "linear-gradient(180deg,#0A0D0F,#0e1114 40%,#0A0D0F)", borderTop: "1px solid rgba(184,115,51,0.12)" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "clamp(64px,9vw,120px) clamp(20px,5vw,72px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: "clamp(36px,5vw,64px)", alignItems: "center" }}>
          <div className="reveal" data-delay="0">
            <span style={{ fontFamily: "var(--ff-body)", fontSize: 12, fontWeight: 600, letterSpacing: ".22em", textTransform: "uppercase", color: "var(--copper)" }}>From the yard</span>
            <h2 style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: "clamp(30px,4.5vw,48px)", color: "var(--text)", lineHeight: 1.1, margin: "16px 0 20px" }}>
              Loaded for export, <span style={accentGradient}>ready for its next life</span>
            </h2>
              <p style={{ fontFamily: "var(--ff-body)", fontSize: 15.5, lineHeight: 1.78, color: "var(--muted)", margin: "0 0 28px", maxWidth: 520 }}>
                Once a lot is graded and prepared, it moves through our export network in carefully loaded containers. Reliable handling turns recovered metal into dependable industrial supply.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 11 }}>
                  {["Loaded at origin", "Container-ready", "Tracked to destination"].map((u) => (
                <span key={u} style={{ fontFamily: "var(--ff-body)", fontSize: 13, fontWeight: 500, color: "var(--copper-light)", padding: "9px 17px", borderRadius: 30, border: "1px solid rgba(184,115,51,0.34)", background: "rgba(184,115,51,0.07)" }}>{u}</span>
              ))}
            </div>
          </div>
          <div className="reveal" data-delay="150">
              <SourcingVideo src="/assets/videos/freight-truck-loaded-metal.mp4" caption="Freight truck loaded with metal" />
          </div>
        </div>
      </section>

      {/* ============ PRODUCT BENTO ============ */}
      <section style={{ position: "relative", zIndex: 5, maxWidth: 1240, margin: "0 auto", padding: "0 clamp(20px,5vw,72px) clamp(64px,9vw,120px)" }}>
        <div className="reveal" data-delay="0" style={{ textAlign: "center", maxWidth: 640, margin: "0 auto clamp(40px,5vw,60px)" }}>
          <span style={{ fontFamily: "var(--ff-body)", fontSize: 12, fontWeight: 600, letterSpacing: ".22em", textTransform: "uppercase", color: "var(--copper)" }}>Our Catalogue</span>
          <h2 style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: "clamp(30px,4.5vw,48px)", color: "var(--text)", lineHeight: 1.1, margin: "16px 0 0" }}>Materials in motion</h2>
          <p style={{ fontFamily: "var(--ff-body)", fontSize: 15, lineHeight: 1.7, color: "var(--muted)", margin: "16px auto 0", maxWidth: 560 }}>From recovered wire and cast ingots to high-value copper-aluminum assemblies, each lot is prepared for its next industrial life.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 22 }}>
          {bento.map((b) => (
            <Link key={b.href} href={b.href} className="bento-card reveal" data-delay={b.delay} style={{ position: "relative", minHeight: 420, borderRadius: 22, overflow: "hidden", textDecoration: "none", border: "1px solid rgba(184,115,51,0.22)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.img} alt={b.title} loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: 0, background: b.overlay }} />
              <div style={{ position: "relative", padding: "30px 28px" }}>
                <span style={{ fontFamily: "var(--ff-body)", fontSize: 11, fontWeight: 600, letterSpacing: ".18em", textTransform: "uppercase", color: b.eyebrowColor }}>{b.eyebrow}</span>
                <h3 style={{ fontFamily: "var(--ff-display)", fontSize: 28, fontWeight: 700, color: "var(--text)", margin: "10px 0 8px" }}>{b.title}</h3>
                <p style={{ fontFamily: "var(--ff-body)", fontSize: 13.5, lineHeight: 1.6, color: "var(--text-dim)", margin: "0 0 16px" }}>{b.desc}</p>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "var(--ff-body)", fontSize: 14, fontWeight: 600, color: "var(--copper-light)" }}>
                  View range
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ============ WHY CHOOSE US ============ */}
      <section style={{ position: "relative", zIndex: 5, background: "linear-gradient(180deg,#0e1114,#0A0D0F)" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "clamp(64px,9vw,120px) clamp(20px,5vw,72px)" }}>
          <div className="reveal" data-delay="0" style={{ textAlign: "center", maxWidth: 640, margin: "0 auto clamp(40px,5vw,60px)" }}>
            <span style={{ fontFamily: "var(--ff-body)", fontSize: 12, fontWeight: 600, letterSpacing: ".22em", textTransform: "uppercase", color: "var(--copper)" }}>Why Choose Us</span>
            <h2 style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: "clamp(30px,4.5vw,48px)", color: "var(--text)", lineHeight: 1.1, margin: "16px 0 0" }}>Built on reliability, grade &amp; trust</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 20 }}>
            {whyCards.map((c) => (
              <div key={c.title} className="why-card reveal" data-delay={c.delay} style={{ padding: "30px 26px", borderRadius: 18, background: "linear-gradient(165deg,rgba(26,31,36,0.6),rgba(17,21,24,0.8))", border: "1px solid rgba(184,115,51,0.2)", backdropFilter: "blur(14px)" }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: "rgba(184,115,51,0.14)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none">{c.icon}</svg>
                </div>
                <h3 style={{ fontFamily: "var(--ff-display)", fontSize: 21, fontWeight: 600, color: "var(--text)", margin: "0 0 10px" }}>{c.title}</h3>
                <p style={{ fontFamily: "var(--ff-body)", fontSize: 13.5, lineHeight: 1.65, color: "var(--muted)", margin: 0 }}>{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ CTA BANNER ============ */}
      <section style={{ position: "relative", zIndex: 5, padding: "clamp(40px,6vw,80px) clamp(20px,5vw,72px)" }}>
        <div className="reveal" data-delay="0" style={{ position: "relative", maxWidth: 1240, margin: "0 auto", borderRadius: 28, overflow: "hidden", padding: "clamp(48px,7vw,84px) clamp(28px,5vw,72px)", background: "linear-gradient(120deg,#7C4A1E,#B87333,#E8A87C)", boxShadow: "0 30px 80px rgba(184,115,51,0.32)" }}>
          <div style={{ position: "absolute", inset: 0, opacity: 0.12, backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
          <div style={{ position: "relative", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 30 }}>
            <div style={{ maxWidth: 600 }}>
              <h2 style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: "clamp(28px,4.2vw,46px)", color: "#1a120b", lineHeight: 1.1, margin: "0 0 12px" }}>Ready to source high-quality metals?</h2>
              <p style={{ fontFamily: "var(--ff-body)", fontSize: 16, lineHeight: 1.6, color: "rgba(26,18,11,0.82)", margin: 0, maxWidth: 520 }}>Tell us your grade, volume and destination — our trade desk will respond with a live quote.</p>
            </div>
            <Link href="/contact" className="btn-dark" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", padding: "17px 34px", borderRadius: 34, background: "var(--bg)", color: "var(--text)", fontFamily: "var(--ff-body)", fontSize: 15.5, fontWeight: 600, boxShadow: "0 14px 34px rgba(0,0,0,0.35)", whiteSpace: "nowrap" }}>
              Contact Our Team
              <ArrowRight width={17} height={17} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
