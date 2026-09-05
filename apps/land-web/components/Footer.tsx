"use client";

import Link from "next/link";
import { site } from "@/lib/site";
import {
  ArrowUp,
  ArrowUpRight,
  LogoMark,
  MailIcon,
  PhoneIcon,
  PinIcon,
  WhatsAppMark,
} from "./icons";
import { useLocale } from "./LocaleProvider";

function ContactRow({
  label,
  value,
  href,
  icon,
}: {
  label: string;
  value: string;
  href: string;
  icon: "phone" | "email";
}) {
  const Icon = icon === "email" ? MailIcon : PhoneIcon;

  return (
    <a href={href} className="footer-contact-row">
      <span className="footer-icon" aria-hidden="true">
        <Icon width={17} height={17} />
      </span>
      <span className="footer-contact-copy">
        <span className="footer-contact-label">{label}</span>
        <span className="footer-contact-value" dir="ltr">{value}</span>
      </span>
      <ArrowUpRight className="footer-row-arrow" width={15} height={15} aria-hidden="true" />
    </a>
  );
}

function OfficeRow({ name, lines, maps }: { name: string; lines: readonly string[]; maps: string }) {
  return (
    <a href={maps} target="_blank" rel="noopener" className="footer-office-row">
      <span className="footer-icon" aria-hidden="true">
        <PinIcon width={17} height={17} />
      </span>
      <span className="footer-office-copy" dir="ltr">
        <strong>{name}</strong>
        <span>{lines.join(" ")}</span>
      </span>
      <ArrowUpRight className="footer-row-arrow" width={15} height={15} aria-hidden="true" />
    </a>
  );
}

export default function Footer() {
  const year = new Date().getFullYear();
  const { t } = useLocale();
  const indexLinks = [
    { label: t.nav.home, href: "/" },
    { label: t.products.copper, href: "/copper" },
    { label: t.products.aluminum, href: "/aluminum" },
    { label: t.products.other, href: "/other-products" },
    { label: t.nav.industries, href: "/industries" },
    { label: t.nav.about, href: "/about-us" },
    { label: t.nav.contact, href: "/contact" },
  ];

  return (
    <footer className="site-footer">
      <div className="footer-glow" aria-hidden="true" />

      <div className="footer-main">
        <section className="footer-brand" aria-label={site.company}>
          <Link href="/" className="footer-logo">
            <LogoMark size={44} />
            <span className="footer-logo-copy">
              <strong>{site.shortName}</strong>
              <span>METALS&nbsp;TRADING&nbsp;L.L.C.</span>
            </span>
          </Link>

          <p>{t.footer.companyDescription}</p>

          <a href={site.whatsapp} target="_blank" rel="noopener" className="footer-whatsapp">
            <span className="footer-whatsapp-icon" aria-hidden="true">
              <WhatsAppMark width={19} height={19} />
            </span>
            <span>{t.actions.whatsappUs}</span>
            <ArrowUpRight width={16} height={16} aria-hidden="true" />
          </a>
        </section>

        <nav className="footer-index" aria-label={t.footer.index}>
          <div className="footer-heading">
            <span>{t.footer.index}</span>
            <span className="footer-heading-line" />
          </div>
          <div className="footer-index-list">
            {indexLinks.map((link) => (
              <Link key={link.href} href={link.href} className="footer-index-link">
                <span className="footer-index-icon" aria-hidden="true">
                  <ArrowUpRight width={13} height={13} />
                </span>
                <span>{link.label}</span>
              </Link>
            ))}
          </div>
        </nav>

        <section className="footer-contact" aria-labelledby="footer-contact-title">
          <div className="footer-heading" id="footer-contact-title">
            <span>{t.footer.contact}</span>
            <span className="footer-heading-line" />
          </div>

          <div className="footer-contact-grid">
            <ContactRow label={site.phones.uaeCeo.label} value={site.phones.uaeCeo.display} href={`tel:${site.phones.uaeCeo.tel}`} icon="phone" />
            <ContactRow label={site.phones.uae.label} value={site.phones.uae.display} href={`tel:${site.phones.uae.tel}`} icon="phone" />
            <ContactRow label={site.phones.iraq.label} value={site.phones.iraq.display} href={`tel:${site.phones.iraq.tel}`} icon="phone" />
            <ContactRow label={site.phones.office.label} value={site.phones.office.display} href={`tel:${site.phones.office.tel}`} icon="phone" />
            <ContactRow label="EMAIL" value={site.email} href={`mailto:${site.email}`} icon="email" />
          </div>

          <div className="footer-offices">
            <OfficeRow {...site.offices.dubai} />
            <OfficeRow {...site.offices.iraq} />
          </div>
        </section>
      </div>

      <div className="footer-bottom">
        <span dir="ltr">© {year} {site.company} — all rights reserved.</span>
        <div className="footer-meta">
          <span className="footer-domain">metal-uae.com</span>
          <a href={site.erp} target="_blank" rel="noopener">
            ERP Portal
            <ArrowUpRight width={14} height={14} aria-hidden="true" />
          </a>
          <a href="#top" aria-label={t.footer.backToTop}>
            {t.footer.backToTop}
            <span className="footer-top-icon" aria-hidden="true">
              <ArrowUp width={14} height={14} />
            </span>
          </a>
        </div>
      </div>
    </footer>
  );
}