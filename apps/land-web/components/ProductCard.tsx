import type { Product } from "@/lib/data";
import { useLocale } from "./LocaleProvider";

export default function ProductCard({ product, onContact }: { product: Product; onContact: () => void }) {
  const { t } = useLocale();
  return (
    <article className="jjm-pcard">
      <div style={{ position: "relative", height: 212, overflow: "hidden", background: "var(--copper-gradient)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="jjm-pimg"
          src={product.image}
          alt={product.title}
          loading="lazy"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            transform: "scale(1)",
            transition: "transform .7s cubic-bezier(.16,1,.3,1)",
            filter: "saturate(1.05) contrast(1.02)",
          }}
        />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(10,13,15,0) 40%,rgba(17,21,24,0.78) 100%)" }} />
        <div
          className="jjm-pshim"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            width: "45%",
            background: "linear-gradient(90deg,transparent,rgba(255,236,214,0.32),transparent)",
            transform: "translateX(-130%) skewX(-20deg)",
            pointerEvents: "none",
          }}
        />
        <span
          style={{
            position: "absolute",
            top: 13,
            left: 13,
            fontFamily: "var(--ff-body)",
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: ".1em",
            textTransform: "uppercase",
            color: "var(--text)",
            padding: "5px 11px",
            borderRadius: 30,
            background: "rgba(10,13,15,0.55)",
            backdropFilter: "blur(6px)",
            border: "1px solid rgba(232,168,124,0.3)",
          }}
        >
          {product.tag}
        </span>
      </div>
      <div style={{ padding: "20px 21px 22px", display: "flex", flexDirection: "column", flex: 1 }}>
        <h3 style={{ fontFamily: "var(--ff-display)", fontSize: 21, fontWeight: 600, color: "var(--text)", margin: "0 0 9px", lineHeight: 1.2 }}>
          {product.title}
        </h3>
        <p style={{ fontFamily: "var(--ff-body)", fontSize: 13.5, lineHeight: 1.62, color: "var(--muted)", margin: "0 0 18px", flex: 1 }}>
          {product.description}
        </p>
        <button
          className="jjm-pbtn"
          onClick={onContact}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            width: "100%",
            cursor: "pointer",
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px solid rgba(184,115,51,0.4)",
            background: "rgba(184,115,51,0.08)",
            color: "var(--copper-light)",
            fontFamily: "var(--ff-body)",
            fontSize: 14,
            fontWeight: 600,
            transition: "all .3s",
          }}
        >
          <span>{t.actions.contactForPrice}</span>
          <svg className="jjm-parrow" width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ transition: "transform .3s" }}>
            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </article>
  );
}
