// Central company / contact constants — single source of truth.

export const site = {
  company: "Jalil Jalal Metals Trading L.L.C.",
  shortName: "Jalil Jalal",
  tagline: "METALS TRADING L.L.C.",
  email: "jalil.jalal.metals@gmail.com",
  phones: {
    uae: { label: "UAE MOBILE", display: "+971 50 154 4497", tel: "+971501544497" },
    iraq: { label: "IRAQ MOBILE", display: "+964 770 154 4498", tel: "+9647701544498" },
    office: { label: "DUBAI OFFICE", display: "+971 4 261 0230", tel: "+97142610230" },
  },
  whatsapp: "https://wa.me/971501544497",
  erp: "https://erp.metal-uae.com",
  offices: {
    dubai: {
      name: "Dubai HQ",
      lines: ["901, Al Reem Tower, Al Maktoum Rd,", "Deira, Al Buteen, Dubai, UAE"],
      maps: "https://www.google.com/maps/search/?api=1&query=Al+Reem+Tower+Al+Maktoum+Road+Deira+Dubai",
    },
    iraq: {
      name: "Sulaymaniyah Office",
      lines: ["Office No. 127, Shawkat Mala Bazaar,", "Sulaymaniyah, Iraq"],
      maps: "https://www.google.com/maps/search/?api=1&query=Shawkat+Mala+Bazaar+Sulaymaniyah+Iraq",
    },
  },
} as const;

export const navLinks = [
  { key: "home", label: "Home", href: "/" },
  { key: "industries", label: "Industries", href: "/industries" },
  { key: "about", label: "About Us", href: "/about-us" },
] as const;

export const productLinks = [
  { label: "Copper Products", href: "/copper", dot: "#E8A87C" },
  { label: "Aluminum Products", href: "/aluminum", dot: "#C9CDD2" },
  { label: "Other Products", href: "/other-products", dot: "#B87333" },
] as const;
