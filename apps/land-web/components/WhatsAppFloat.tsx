"use client";

import { useEffect, useRef, useState } from "react";
import { site } from "@/lib/site";
import { WhatsAppGlyph } from "./icons";
import { useLocale } from "./LocaleProvider";

export default function WhatsAppFloat() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const roleLabels = {
    uaeCeo: t.actions.uaeCeo,
    uaeTeam: t.actions.uaeTeam,
    iraqTeam: t.actions.iraqTeam,
    dubaiOffice: t.actions.dubaiOffice,
  };

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div ref={rootRef} className="whatsapp-float-wrap">
      <div className={`whatsapp-contact-menu${open ? " is-open" : ""}`} role="menu" aria-label={t.actions.whatsappChoose}>
        <div className="whatsapp-menu-head">
          <span className="whatsapp-menu-mark"><WhatsAppGlyph width={20} height={20} /></span>
          <span>{t.actions.whatsappChoose}</span>
        </div>
        <div className="whatsapp-contact-list">
          {site.whatsappContacts.map((contact) => (
            <a
              key={contact.href}
              className="whatsapp-contact-option"
              href={contact.href}
              target="_blank"
              rel="noopener"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <span className="whatsapp-contact-avatar">
                <WhatsAppGlyph width={20} height={20} />
              </span>
              <span className="whatsapp-contact-copy">
                <strong>{roleLabels[contact.role]}</strong>
                <small dir="ltr">{contact.display}</small>
              </span>
              <span className="whatsapp-contact-arrow" aria-hidden="true">↗</span>
            </a>
          ))}
        </div>
      </div>
      <button
        type="button"
        className="float-cta"
        aria-label={t.actions.chatWhatsapp}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <WhatsAppGlyph width={30} height={30} style={{ color: "#fff" }} />
        <span>{t.actions.whatsappUs}</span>
      </button>
    </div>
  );
}
