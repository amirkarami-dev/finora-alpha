"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "./icons";

type Sector = { num: string; title: string; desc: string; img: string; icon: ReactNode; delay: string };

const sectors: Sector[] = [
  {
    num: "Sector 01",
    title: "Foundries & Smelters",
    desc: "Clean, consistent charge metal — copper, aluminum and lead — graded for predictable melt yield and minimal slag.",
    img: "/assets/ind-foundry.jpg",
    delay: "0",
    icon: (
      <>
        <path d="M3 20h18M5 20V9l5 3V9l5 3V8l4 2v10" stroke="#E8A87C" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M9 5l1-2 1 2" stroke="#E8A87C" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
  },
  {
    num: "Sector 02",
    title: "Cable Manufacturers",
    desc: "High-conductivity copper rod, wire scrap and granules for drawing conductors and building wire.",
    img: "/assets/ind-cable.jpg",
    delay: "100",
    icon: (
      <>
        <path d="M4 7c4 0 4 10 8 10s4-10 8-10" stroke="#E8A87C" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="4" cy="7" r="2" stroke="#E8A87C" strokeWidth="1.6" />
        <circle cx="20" cy="7" r="2" stroke="#E8A87C" strokeWidth="1.6" />
      </>
    ),
  },
  {
    num: "Sector 03",
    title: "Recyclers",
    desc: "Reliable offtake and supply of sorted non-ferrous scrap, baled and documented for cross-border trade.",
    img: "/assets/ind-recycle.jpg",
    delay: "200",
    icon: (
      <path d="M7 7l2-3h6l2 3M17 7l-2 4M9 17l-2-4M12 21l3-2M7 17H4l2-4M20 13l-3 6h-4" stroke="#E8A87C" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    num: "Sector 04",
    title: "Battery & Energy",
    desc: "Refined lead ingots and pyramids for battery production, storage and energy infrastructure.",
    img: "/assets/ind-battery.jpg",
    delay: "0",
    icon: (
      <>
        <rect x="4" y="8" width="15" height="9" rx="2" stroke="#E8A87C" strokeWidth="1.6" />
        <path d="M19 11h2v3h-2M8 10v5M11 10v5" stroke="#E8A87C" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
  },
  {
    num: "Sector 05",
    title: "Construction & Infrastructure",
    desc: "Aluminum and copper inputs for cabling, cladding and structural applications at project scale.",
    img: "/assets/ind-construction.jpg",
    delay: "100",
    icon: <path d="M3 21h18M6 21V8l6-4 6 4v13M10 21v-5h4v5" stroke="#E8A87C" strokeWidth="1.6" strokeLinejoin="round" />,
  },
  {
    num: "Sector 06",
    title: "Metal Traders & Exporters",
    desc: "Bulk volumes, transparent grading and dependable logistics for fellow traders across the Gulf and Asia.",
    img: "/assets/ind-trade.jpg",
    delay: "200",
    icon: <path d="M3 12h4l3 8 4-16 3 8h4" stroke="#E8A87C" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
  },
];

export default function IndustriesView() {
  const bgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY || 0;
        if (bgRef.current) bgRef.current.style.transform = `scale(1.15) translateY(${y * 0.12}px)`;
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div style={{ position: "relative", background: "var(--bg)", minHeight: "100vh", overflowX: "hidden" }}>
      {/* Hero */}
      <section style={{ position: "relative", minHeight: "58vh", display: "flex", alignItems: "flex-end", overflow: "hidden" }}>
        <div ref={bgRef} style={{ position: "absolute", inset: 0, transform: "scale(1.15)", willChange: "transform" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/ind-foundry.jpg" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.5 }} />
        </div>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 60% at 70% 20%, rgba(184,115,51,0.26), transparent 60%), linear-gradient(180deg, rgba(10,13,15,0.5) 0%, rgba(10,13,15,0.55) 45%, rgba(10,13,15,0.98) 100%)" }} />
        <div style={{ position: "relative", zIndex: 3, width: "100%", maxWidth: 1240, margin: "0 auto", padding: "150px clamp(20px,5vw,72px) 56px" }}>
          <span className="reveal reveal-sm" data-delay="0" style={{ display: "inline-block", fontFamily: "var(--ff-body)", fontSize: 12, fontWeight: 600, letterSpacing: ".22em", textTransform: "uppercase", color: "var(--copper)", marginBottom: 16 }}>Who We Supply</span>
          <h1 className="reveal reveal-sm" data-delay="80" style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: "clamp(38px,7vw,80px)", lineHeight: 1, color: "var(--text)", margin: 0, letterSpacing: "-0.02em" }}>
            Industries We{" "}
            <span style={{ background: "linear-gradient(135deg,#E8A87C,#B87333,#7C4A1E)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>Serve</span>
          </h1>
          <p className="reveal reveal-sm" data-delay="180" style={{ fontFamily: "var(--ff-body)", fontSize: "clamp(15px,1.7vw,18px)", lineHeight: 1.7, color: "var(--text-dim)", maxWidth: 620, margin: "22px 0 0" }}>
            From smelters to cable plants, our material keeps production lines running across six core sectors of the metals economy.
          </p>
        </div>
      </section>

      {/* Sector grid */}
      <section style={{ position: "relative", zIndex: 5, maxWidth: 1240, margin: "0 auto", padding: "clamp(50px,7vw,86px) clamp(20px,5vw,72px) clamp(64px,9vw,110px)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 22 }}>
          {sectors.map((s) => (
            <article key={s.title} className="jjm-icard reveal" data-delay={s.delay} style={{ position: "relative", minHeight: 400, borderRadius: 20, overflow: "hidden", border: "1px solid rgba(184,115,51,0.2)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="jjm-iimg" src={s.img} alt={s.title} loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transition: "transform .7s cubic-bezier(.16,1,.3,1)" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(10,13,15,0.15),rgba(10,13,15,0.55) 45%,rgba(10,13,15,0.95))" }} />
              <div style={{ position: "relative", padding: "28px 26px" }}>
                <div style={{ width: 48, height: 48, borderRadius: 13, background: "rgba(184,115,51,0.18)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, border: "1px solid rgba(232,168,124,0.3)" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">{s.icon}</svg>
                </div>
                <span style={{ fontFamily: "var(--ff-body)", fontSize: 11, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--accent)" }}>{s.num}</span>
                <h3 style={{ fontFamily: "var(--ff-display)", fontSize: 25, fontWeight: 700, color: "var(--text)", margin: "8px 0 9px" }}>{s.title}</h3>
                <p style={{ fontFamily: "var(--ff-body)", fontSize: 13.5, lineHeight: 1.6, color: "var(--text-dim)", margin: 0 }}>{s.desc}</p>
              </div>
            </article>
          ))}
        </div>

        <div className="reveal" data-delay="0" style={{ marginTop: "clamp(48px,6vw,72px)", textAlign: "center" }}>
          <h3 style={{ fontFamily: "var(--ff-display)", fontSize: "clamp(24px,3.6vw,38px)", fontWeight: 700, color: "var(--text)", margin: "0 0 14px" }}>Don&apos;t see your sector?</h3>
          <p style={{ fontFamily: "var(--ff-body)", fontSize: 15.5, lineHeight: 1.7, color: "var(--muted)", maxWidth: 540, margin: "0 auto 26px" }}>
            If you melt it, draw it, cast it or trade it, we can likely supply it. Let&apos;s talk specifications.
          </p>
          <Link href="/contact" className="btn-copper" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", padding: "16px 32px", borderRadius: 34, background: "var(--copper-gradient)", color: "var(--bg)", fontFamily: "var(--ff-body)", fontSize: 15, fontWeight: 700, boxShadow: "0 14px 34px rgba(184,115,51,0.4)" }}>
            Get in Touch <ArrowRight width={16} height={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}
