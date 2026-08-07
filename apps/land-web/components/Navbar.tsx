"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { site, productLinks } from "@/lib/site";
import { LogoMark } from "./icons";

function activeFromPath(path: string): string {
  if (path === "/") return "home";
  if (path === "/copper" || path === "/aluminum" || path === "/other-products") return "products";
  if (path.startsWith("/industries")) return "industries";
  if (path.startsWith("/about")) return "about";
  if (path.startsWith("/contact")) return "contact";
  return "";
}

const logoText = { fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: 19, color: "var(--text)", letterSpacing: ".01em" } as const;
const logoSub = { fontFamily: "var(--ff-body)", fontWeight: 500, fontSize: 9.5, color: "var(--accent)", letterSpacing: ".28em", marginTop: 3 } as const;

export default function Navbar() {
  const pathname = usePathname() || "/";
  const active = activeFromPath(pathname);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled((window.scrollY || window.pageYOffset) > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile menu on navigation + lock body scroll while open.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className={`jjm-header${scrolled ? " nav-scrolled" : ""}`} data-active={active}>
        {/* Logo (left zone) */}
        <div style={{ flex: "1 1 0", display: "flex", alignItems: "center", minWidth: 0 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 13, textDecoration: "none" }}>
            <LogoMark size={38} />
            <span style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
              <span style={logoText}>{site.shortName}</span>
              <span style={logoSub}>METALS&nbsp;TRADING&nbsp;L.L.C.</span>
            </span>
          </Link>
        </div>

        {/* Centered nav */}
        <nav className="jjm-desktop-nav">
          <Link href="/" data-nav="home" className={`jjm-navlink${active === "home" ? " is-active" : ""}`}>
            Home
          </Link>
          <div className="jjm-prodwrap">
            <span data-nav="products" className={`jjm-navlink${active === "products" ? " is-active" : ""}`}>
              Products
              <svg className="jjm-chev" width="11" height="11" viewBox="0 0 12 12">
                <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="jjm-drop">
              {productLinks.map((p) => (
                <Link key={p.href} href={p.href} className="jjm-droplink">
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: p.dot, boxShadow: `0 0 8px ${p.dot}`, flex: "0 0 auto" }} />
                  {p.label}
                </Link>
              ))}
            </div>
          </div>
          <Link href="/industries" data-nav="industries" className={`jjm-navlink${active === "industries" ? " is-active" : ""}`}>
            Industries
          </Link>
          <Link href="/about-us" data-nav="about" className={`jjm-navlink${active === "about" ? " is-active" : ""}`}>
            About Us
          </Link>
        </nav>

        {/* Right zone: contact + burger */}
        <div style={{ flex: "1 1 0", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 14 }}>
          <Link href="/contact" className={`jjm-contactbtn${active === "contact" ? " is-active" : ""}`}>
            Contact
          </Link>
          <button
            aria-label="Menu"
            aria-expanded={open}
            className={`jjm-burger${open ? " is-open" : ""}`}
            onClick={() => setOpen((o) => !o)}
          >
            <span className="hb1" />
            <span className="hb2" />
            <span className="hb3" />
          </button>
        </div>
      </header>

      {/* Mobile overlay menu */}
      <div className={`jjm-mob-ov${open ? " is-open" : ""}`} onClick={() => setOpen(false)}>
        <div className="jjm-mob-inner" onClick={(e) => e.stopPropagation()}>
          <Link className="jjm-mlink" href="/">Home</Link>
          <div className="jjm-mob-div" />
          <span className="jjm-mob-label">Products</span>
          {productLinks.map((p) => (
            <Link key={p.href} className="jjm-mlink sub" href={p.href}>
              {p.label}
            </Link>
          ))}
          <div className="jjm-mob-div" />
          <Link className="jjm-mlink" href="/industries">Industries</Link>
          <Link className="jjm-mlink" href="/about-us">About Us</Link>
          <Link className="jjm-mlink" href="/contact">Contact</Link>
        </div>
      </div>
    </>
  );
}
