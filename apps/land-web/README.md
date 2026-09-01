# Jalil Jalal Metals Trading L.L.C. — Website

Corporate website for a UAE-based B2B non-ferrous metals trading & export company,
implemented from a Claude Design handoff bundle. Dark "copper luxury" industrial
aesthetic — glassmorphism, scroll-reveal animations, animated stat counters,
parallax hero, sticky glass navbar, and a floating WhatsApp CTA.

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **next/font** (Playfair Display + Inter, self-hosted)
- Plain CSS (design tokens in [`app/globals.css`](app/globals.css)) + inline styles — no UI framework

## Getting started

```bash
npm install
npm run dev      # http://localhost:3032
npm run build    # production build (all pages prerender statically)
npm start        # serve the production build
```

## Pages

| Route              | Page                                                |
| ------------------ | --------------------------------------------------- |
| `/`                | Home — kinetic hero, animated stats, bento, why-us  |
| `/copper`          | Copper Products (8 items)                            |
| `/aluminum`        | Aluminum Products (4 items)                          |
| `/other-products`  | Other Products — Lead, Brass & Specialty (4 items)  |
| `/industries`      | Industries We Serve (6-sector bento)                |
| `/contact`         | Contact — validated inquiry form + address cards    |
| `/about-us`        | About Us — story, mission, regions, product table   |

## Structure

```
app/                 routes (one folder per page) + globals.css + layout.tsx
components/          Navbar, Footer, WhatsAppFloat, ScrollReveal,
                    ProductCard, ContactModal, ProductCategory,
                    IndustriesView, ContactView, icons
lib/                 site.ts (contact constants) · data.ts (catalogue)
public/assets/       23 metallic texture images
```

Shared chrome (navbar, footer, WhatsApp float, scroll-reveal driver) lives in
[`app/layout.tsx`](app/layout.tsx) so every page gets it. The active nav item is
derived from the current route.

## Notes for going live

- **Images** — the 23 files in `public/assets/` are on-brand *procedural placeholder
  textures* generated during the design phase (the design sandbox blocked stock
  photography). Swap them for real product/industrial photography when available;
  filenames can stay the same. Consider migrating `<img>` to `next/image` at that point.
- **Contact form** — currently validates and shows a success state client-side only;
  it does **not** send anywhere. Wire `submit()` in
  [`components/ContactView.tsx`](components/ContactView.tsx) to an email service,
  API route, or form backend (e.g. Resend, Formspree) to deliver inquiries.
- **No legal pages.** The footer used to carry `Privacy Policy` and `Terms & Conditions`
  links pointing at `#`; they were dropped rather than left dead. Add them back to
  [`components/Footer.tsx`](components/Footer.tsx) once the pages exist.
- **ESLint** isn't wired in yet (`eslint.ignoreDuringBuilds` is on). Add
  `eslint` + `eslint-config-next` and a config to enable `npm run lint`.
