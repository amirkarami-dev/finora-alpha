// Product catalogue + industries data, derived from the design brief.

export type Product = {
  title: string;
  description: string;
  image: string;
  tag: string;
};

export type ProductCategory = {
  slug: string;
  navActive: "products";
  breadcrumb: string;
  /** Heading rendered as `<lead> <accent>` */
  headingLead: string;
  headingAccent: string;
  /** Optional small sub-heading under the title (Other Products) */
  headingSub?: string;
  intro: string;
  heroImage: string;
  /** radial-gradient tint colour for the hero glow */
  heroTint: string;
  products: Product[];
  ctaTitle: string;
  ctaText: string;
};

export const copper: ProductCategory = {
  slug: "copper",
  navActive: "products",
  breadcrumb: "Copper Products",
  headingLead: "Copper",
  headingAccent: "Products",
  intro:
    "High-purity copper in every traded form — from bright bare Millberry wire to cast billets and refined ingots. All grades sorted, quality-checked and export-ready.",
  heroImage: "/assets/cu-coil.jpg",
  heroTint: "rgba(184,115,51,0.28)",
  ctaTitle: "Need a grade not listed here?",
  ctaText:
    "We source to specification. Tell us your purity, volume and destination port — our desk will revert with availability and a live quote.",
  products: [
    {
      title: "Mixed Copper Wire Scrap",
      description:
        "Bright, unalloyed mixed copper wire (grades #1 / #2), sorted and baled — a versatile feedstock for smelters and refiners.",
      image: "/assets/cu-coil.jpg",
      tag: "Grade #1/#2",
    },
    {
      title: "Copper Bus Bar Scrap",
      description:
        "Heavy-gauge electrical bus bars, clean and high-conductivity — ideal for direct remelting and refining.",
      image: "/assets/cu-bus.jpg",
      tag: "High Conductivity",
    },
    {
      title: "Copper Granules",
      description:
        "Mechanically processed copper granules with minimal impurities and consistent sizing for foundry charging.",
      image: "/assets/cu-gran.jpg",
      tag: "99%+ Cu",
    },
    {
      title: "Copper Wire Rod",
      description:
        "8mm electrolytic copper wire rod for drawing into conductors, cables and enamelled winding wire.",
      image: "/assets/cu-rod.jpg",
      tag: "Export Grade",
    },
    {
      title: "Cliff Copper Scrap",
      description:
        "Tin-coated and mixed copper (Cliff grade) recovered from electrical assemblies and components.",
      image: "/assets/cu-facet.jpg",
      tag: "Cliff Grade",
    },
    {
      title: "Millberry Copper Wire Scrap",
      description:
        "Bare bright Millberry copper wire at 99.9% — the premium global benchmark for copper scrap.",
      image: "/assets/cu-coil.jpg",
      tag: "99.9% Millberry",
    },
    {
      title: "Copper Billets",
      description:
        "Cast copper billets in custom dimensions for extrusion, drawing and downstream forming.",
      image: "/assets/cu-bars.jpg",
      tag: "Cast Billet",
    },
    {
      title: "Copper Ingots",
      description:
        "Refined copper ingots with certified purity for foundries, alloy producers and casting houses.",
      image: "/assets/cu-bars.jpg",
      tag: "Refined",
    },
  ],
};

export const aluminum: ProductCategory = {
  slug: "aluminum",
  navActive: "products",
  breadcrumb: "Aluminum Products",
  headingLead: "Aluminum",
  headingAccent: "Products",
  intro:
    "Consistent, foundry-ready aluminum across ingots, granules, pressed bales and UBC scrap — sorted for purity and supplied at scale.",
  heroImage: "/assets/al-bars.jpg",
  heroTint: "rgba(154,163,173,0.2)",
  ctaTitle: "Looking for a specific alloy or volume?",
  ctaText:
    "Share your specification and destination — we'll confirm availability, packaging and a live quote.",
  products: [
    {
      title: "Aluminum Ingots",
      description:
        "Primary and secondary aluminum ingots cast to standard alloy specifications for foundries and die-casters.",
      image: "/assets/al-bars.jpg",
      tag: "Alloy Cast",
    },
    {
      title: "Aluminum Granules",
      description:
        "Uniformly sized aluminum granules with controlled chemistry — clean charge material for melting.",
      image: "/assets/al-gran.jpg",
      tag: "Sized Charge",
    },
    {
      title: "Aluminum Scrap — Pressed Bales",
      description:
        "Compacted aluminum scrap in dense pressed bales for efficient transport and high melting yield.",
      image: "/assets/al-bale.jpg",
      tag: "Pressed Bale",
    },
    {
      title: "UBC Aluminum Scrap",
      description:
        "Used Beverage Can scrap, baled and contaminant-free — a prime feedstock for can-sheet recycling.",
      image: "/assets/al-facet.jpg",
      tag: "UBC Grade",
    },
  ],
};

export const otherProducts: ProductCategory = {
  slug: "other-products",
  navActive: "products",
  breadcrumb: "Other Products",
  headingLead: "Other Products",
  headingAccent: "",
  headingSub: "Lead, Brass & Specialty Metals",
  intro:
    "Beyond copper and aluminum — refined lead, brass scrap and insulated power cables, all sorted to grade and ready for export.",
  heroImage: "/assets/br-facet.jpg",
  heroTint: "rgba(194,162,78,0.22)",
  ctaTitle: "Sourcing another non-ferrous metal?",
  ctaText:
    "Our network extends well beyond this list. Tell us what you need and we'll source it to specification.",
  products: [
    {
      title: "Industrial Lead Ingots",
      description:
        "Refined lead ingots (99.97%+) for batteries, radiation shielding and industrial alloying.",
      image: "/assets/pb-bars.jpg",
      tag: "99.97% Pb",
    },
    {
      title: "Cast Lead Pyramids",
      description:
        "Cast lead pyramids in handling-friendly form — consistent weight and purity for remelting.",
      image: "/assets/pb-pyr.jpg",
      tag: "Cast Form",
    },
    {
      title: "Brass Scrap",
      description:
        "Mixed and honey brass scrap, sorted by grade — a reliable feed for brass foundries and fittings.",
      image: "/assets/br-facet.jpg",
      tag: "Honey / Mixed",
    },
    {
      title: "Insulated Copper Power Cables",
      description:
        "Insulated copper power cables with high recoverable copper content — graded by yield.",
      image: "/assets/cable.jpg",
      tag: "High Yield",
    },
  ],
};

export const categories: Record<string, ProductCategory> = {
  copper,
  aluminum,
  "other-products": otherProducts,
};
