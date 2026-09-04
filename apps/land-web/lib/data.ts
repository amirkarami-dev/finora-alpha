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
  heroImage: "/assets/products/copper/copper-wire-bulk.jpg",
  heroTint: "rgba(184,115,51,0.28)",
  ctaTitle: "Need a grade not listed here?",
  ctaText:
    "We source to specification. Tell us your purity, volume and destination port — our desk will revert with availability and a live quote.",
  products: [
    {
      title: "Bulk Copper Wire Scrap",
      description:
        "Mixed copper wire and conductor offcuts supplied in bulk bags for recovery, sorting and high-yield remelting.",
      image: "/assets/products/copper/copper-wire-bulk.jpg",
      tag: "Bulk Supply",
    },
    {
      title: "Mixed Copper Wire Bales",
      description:
        "Prepared copper wire bundles with a practical mix of insulated and bare material, graded by recoverable copper content.",
      image: "/assets/products/copper/mixed-wire.jpg",
      tag: "Sorted Feedstock",
    },
    {
      title: "Reclaimed Heat Exchangers",
      description:
        "Copper and aluminum heat exchanger assemblies recovered for dismantling, separation and metal reclamation.",
      image: "/assets/products/stock-09.jpeg",
      tag: "Cu / Al Recovery",
    },
    {
      title: "Mixed Copper Wire Scrap",
      description:
        "Bright, unalloyed mixed copper wire (grades #1 / #2), sorted and baled — a versatile feedstock for smelters and refiners.",
      image: "/assets/products/copper/mixed-conductor-wire.jpg",
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
      image: "/assets/products/copper/copper-rod-stock.jpg",
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
      image: "/assets/products/copper/bright-copper-wire.jpg",
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
  heroImage: "/assets/products/aluminum/aluminum-ingots.jpg",
  heroTint: "rgba(154,163,173,0.2)",
  ctaTitle: "Looking for a specific alloy or volume?",
  ctaText:
    "Share your specification and destination — we'll confirm availability, packaging and a live quote.",
  products: [
    {
      title: "Aluminum Profile Scrap",
      description:
        "Sorted aluminum window and extrusion profiles recovered from demolition and fabrication streams for efficient remelting.",
      image: "/assets/products/aluminum/profile-scrap.jpg",
      tag: "Profile Scrap",
    },
    {
      title: "Container-Ready Aluminum Bales",
      description:
        "Dense, strapped aluminum bales prepared for export loading, efficient handling and consistent foundry feed.",
      image: "/assets/products/aluminum/container-bales.jpg",
      tag: "Export Bale",
    },
    {
      title: "Premium Aluminum Scrap Bales",
      description:
        "Dense, strapped aluminum scrap bales prepared for efficient container loading and foundry charging.",
      image: "/assets/products/aluminum/pressed-bales.jpg",
      tag: "Premium Bale",
    },
    {
      title: "Aluminum Ingots",
      description:
        "Strapped aluminum ingot lots for remelting, casting and secondary alloy production with consistent handling units.",
      image: "/assets/products/aluminum/aluminum-ingots.jpg",
      tag: "Cast Alloy",
    },
    {
      title: "Aluminum Ingots",
      description:
        "Primary and secondary aluminum ingots cast to standard alloy specifications for foundries and die-casters.",
      image: "/assets/products/aluminum/aluminum-ingots.jpg",
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
      image: "/assets/products/aluminum/pressed-bales.jpg",
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
  heroImage: "/assets/products/stock-07.jpeg",
  heroTint: "rgba(194,162,78,0.22)",
  ctaTitle: "Sourcing another non-ferrous metal?",
  ctaText:
    "Our network extends well beyond this list. Tell us what you need and we'll source it to specification.",
  products: [
    {
      title: "Industrial Lead Ingots",
      description:
        "Cast lead ingots marked for traceable lots, suitable for battery, shielding and industrial alloy applications.",
      image: "/assets/products/stock-03.jpeg",
      tag: "99.97% Pb",
    },
    {
      title: "Cast Alloy Ingots",
      description:
        "Heavy cast alloy blocks supplied for controlled remelting and industrial feedstock programs.",
      image: "/assets/products/stock-04.jpeg",
      tag: "Cast Stock",
    },
    {
      title: "Assorted Non-Ferrous Scrap",
      description:
        "Clean, sorted mixed-metal scrap in bulk bags, prepared for specialist separation and downstream manufacturing.",
      image: "/assets/products/stock-07.jpeg",
      tag: "Grade A Assorted",
    },
    {
      title: "Sorted Metal Castings",
      description:
        "Commercial castings separated by material family and supplied for foundry charge and metal recovery.",
      image: "/assets/products/stock-08.jpeg",
      tag: "Sorted Castings",
    },
    {
      title: "Heat Exchanger Plates",
      description:
        "Recovered copper-aluminum exchanger plates and assemblies for high-value metal separation and recycling.",
      image: "/assets/products/stock-10.jpeg",
      tag: "Cu / Al Recovery",
    },
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
