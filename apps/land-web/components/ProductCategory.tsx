"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ProductCategory as Category } from "@/lib/data";
import ProductCard from "./ProductCard";
import ContactModal from "./ContactModal";
import { ArrowRight } from "./icons";

const accentGradient = {
  background: "linear-gradient(135deg,#E8A87C,#B87333,#7C4A1E)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
} as const;

export default function ProductCategory({ data }: { data: Category }) {
  const [modalOpen, setModalOpen] = useState(false);
  const bgRef = useRef<HTMLDivElement>(null);

  // Parallax drift on the hero background.
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

  const open = () => setModalOpen(true);

  return (
    <div style={{ position: "relative", background: "var(--bg)", minHeight: "100vh", overflowX: "hidden" }}>
      {/* Hero */}
      <section style={{ position: "relative", minHeight: "60vh", display: "flex", alignItems: "flex-end", overflow: "hidden" }}>
        <div ref={bgRef} style={{ position: "absolute", inset: 0, transform: "scale(1.15)", willChange: "transform" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.heroImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.55 }} />
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(ellipse 70% 60% at 75% 20%, ${data.heroTint}, transparent 60%), linear-gradient(180deg, rgba(10,13,15,0.5) 0%, rgba(10,13,15,0.55) 45%, rgba(10,13,15,0.98) 100%)`,
          }}
        />
        <div style={{ position: "relative", zIndex: 3, width: "100%", maxWidth: 1240, margin: "0 auto", padding: "150px clamp(20px,5vw,72px) 60px" }}>
          <div
            className="reveal reveal-sm"
            data-delay="0"
            style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--ff-body)", fontSize: 13, color: "var(--muted)", marginBottom: 20 }}
          >
            <Link href="/" style={{ color: "var(--muted)", textDecoration: "none" }}>Home</Link>
            <span style={{ color: "var(--copper)" }}>/</span>
            <span style={{ color: "var(--accent)" }}>{data.breadcrumb}</span>
          </div>

          {data.headingSub ? (
            <h1
              className="reveal reveal-sm"
              data-delay="80"
              style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: "clamp(34px,6vw,72px)", lineHeight: 1.04, color: "var(--text)", margin: 0, letterSpacing: "-0.02em" }}
            >
              {data.headingLead}
              <span style={{ display: "block", fontSize: "0.5em", fontWeight: 600, color: "var(--accent)", marginTop: 10, letterSpacing: 0 }}>{data.headingSub}</span>
            </h1>
          ) : (
            <h1
              className="reveal reveal-sm"
              data-delay="80"
              style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: "clamp(40px,7vw,82px)", lineHeight: 1, color: "var(--text)", margin: 0, letterSpacing: "-0.02em" }}
            >
              {data.headingLead} <span style={accentGradient}>{data.headingAccent}</span>
            </h1>
          )}

          <p
            className="reveal reveal-sm"
            data-delay="180"
            style={{ fontFamily: "var(--ff-body)", fontSize: "clamp(15px,1.7vw,18px)", lineHeight: 1.7, color: "var(--text-dim)", maxWidth: 600, margin: "22px 0 0" }}
          >
            {data.intro}
          </p>
        </div>
      </section>

      {/* Product grid */}
      <section style={{ position: "relative", zIndex: 5, maxWidth: 1240, margin: "0 auto", padding: "clamp(50px,7vw,86px) clamp(20px,5vw,72px) clamp(64px,9vw,110px)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(310px,1fr))", gap: 24 }}>
          {data.products.map((p, i) => (
            <div key={p.title + i} className="reveal" data-delay={i % 2 === 0 ? "0" : "80"}>
              <ProductCard product={p} onContact={open} />
            </div>
          ))}
        </div>

        {/* CTA banner */}
        <div
          className="reveal"
          data-delay="0"
          style={{
            marginTop: "clamp(48px,6vw,72px)",
            borderRadius: 22,
            overflow: "hidden",
            padding: "clamp(36px,5vw,56px)",
            background: "linear-gradient(120deg,rgba(124,74,30,0.5),rgba(184,115,51,0.32))",
            border: "1px solid rgba(184,115,51,0.35)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          <div style={{ maxWidth: 560 }}>
            <h3 style={{ fontFamily: "var(--ff-display)", fontSize: "clamp(24px,3.4vw,34px)", fontWeight: 700, color: "var(--text)", margin: "0 0 8px" }}>{data.ctaTitle}</h3>
            <p style={{ fontFamily: "var(--ff-body)", fontSize: 15, lineHeight: 1.6, color: "#E8D5C5", margin: 0 }}>{data.ctaText}</p>
          </div>
          <button
            onClick={open}
            className="btn-dark-soft"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
              padding: "16px 30px",
              borderRadius: 34,
              border: "none",
              background: "var(--bg)",
              color: "var(--text)",
              fontFamily: "var(--ff-body)",
              fontSize: 15,
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            Request a Quote <ArrowRight width={16} height={16} />
          </button>
        </div>
      </section>

      <ContactModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
