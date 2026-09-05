export type Locale = "en" | "ku" | "ar";

type Copy = {
  language: string;
  languageEnglish: string;
  nav: {
    home: string;
    products: string;
    industries: string;
    about: string;
    contact: string;
    menu: string;
  };
  products: {
    copper: string;
    aluminum: string;
    other: string;
  };
  actions: {
    exploreProducts: string;
    aboutUs: string;
    contactForPrice: string;
    requestQuote: string;
    chatWhatsapp: string;
    whatsappUs: string;
    whatsappChoose: string;
    uaeCeo: string;
    uaeTeam: string;
    iraqTeam: string;
    dubaiOffice: string;
    scroll: string;
  };
  catalogue: {
    home: string;
    productTypes: string;
    sourceToSpecification: string;
    quoteHint: string;
  };
  footer: {
    index: string;
    contact: string;
    companyDescription: string;
    backToTop: string;
  };
  home: {
    eyebrow: string;
    heroTitle: string;
    heroSubtitle: string;
    heroDescription: string;
    stats: [string, string, string, string];
    whoWeAre: string;
    welcomeTitle: string;
    welcomeText: string;
    fromTheYard: string;
    yardTitle: string;
    catalogue: string;
    catalogueTitle: string;
    whyChooseUs: string;
    reliabilityTitle: string;
    ctaTitle: string;
    ctaText: string;
    contactTeam: string;
  };
};

export const locales: Record<Locale, Copy> = {
  en: {
    language: "English",
    languageEnglish: "English",
    nav: { home: "Home", products: "Products", industries: "Industries", about: "About Us", contact: "Contact", menu: "Menu" },
    products: { copper: "Copper Products", aluminum: "Aluminum Products", other: "Other Products" },
    actions: {
      exploreProducts: "Explore Products",
      aboutUs: "About Us",
      contactForPrice: "Contact for Price",
      requestQuote: "Request a Quote",
      chatWhatsapp: "Chat with us on WhatsApp",
      whatsappUs: "WhatsApp Us",
      whatsappChoose: "Choose a WhatsApp contact",
      uaeCeo: "UAE CEO",
      uaeTeam: "UAE Trade Desk",
      iraqTeam: "Iraq Trade Desk",
      dubaiOffice: "Dubai Office",
      scroll: "Scroll",
    },
    catalogue: {
      home: "Home",
      productTypes: "Product Types",
      sourceToSpecification: "We source to specification.",
      quoteHint: "Tell us your purity, volume and destination port — our desk will revert with availability and a live quote.",
    },
    footer: {
      index: "Index",
      contact: "Contact",
      companyDescription: "Sourcing, processing & exporting premium non-ferrous metals across the Persian Gulf, Middle East, China & India.",
      backToTop: "Back to top",
    },
    home: {
      eyebrow: "Dubai · Iraq · Worldwide Non-Ferrous Metals Trade",
      heroTitle: "Metal is Our Craft",
      heroSubtitle: "Trust is Our Core",
      heroDescription: "We source, process and export copper, aluminum, lead and brass to foundries, manufacturers and recyclers across the Gulf and beyond — clean material, transparent trade, dependable supply.",
      stats: ["Countries Served", "Product Types", "Active Clients", "Years of Trade"],
      whoWeAre: "Who We Are",
      welcomeTitle: "A trusted name in non-ferrous metals trade",
      welcomeText: "Jalil Jalal Metals Trading L.L.C. is a UAE-based company engaged in the trading and export of non-ferrous metals — copper, aluminum, lead, brass and related products. From our base in Dubai and operations in Sulaymaniyah, we deliver consistent grade and reliable logistics.",
      fromTheYard: "From the yard",
      yardTitle: "Loaded for export, ready for its next life",
      catalogue: "Our Catalogue",
      catalogueTitle: "Materials in motion",
      whyChooseUs: "Why Choose Us",
      reliabilityTitle: "Built on reliability, grade & trust",
      ctaTitle: "Ready to source high-quality metals?",
      ctaText: "Tell us your grade, volume and destination — our trade desk will respond with a live quote.",
      contactTeam: "Contact Our Team",
    },
  },
  ku: {
    language: "کوردی",
    languageEnglish: "Kurdish",
    nav: { home: "سەرەکی", products: "بەرهەمەکان", industries: "بوارەکان", about: "دەربارەی ئێمە", contact: "پەیوەندی", menu: "مێنیو" },
    products: { copper: "بەرهەمەکانی مس", aluminum: "بەرهەمەکانی ئەڵۆمینیۆم", other: "بەرهەمەکانی تر" },
    actions: {
      exploreProducts: "بینینی بەرهەمەکان",
      aboutUs: "دەربارەی ئێمە",
      contactForPrice: "بۆ نرخ پەیوەندیمان پێوە بکە",
      requestQuote: "داواکاری نرخ",
      chatWhatsapp: "لە واتسئەپ پەیوەندیمان پێوە بکە",
      whatsappUs: "واتسئەپ",
      whatsappChoose: "ژمارەی واتسئەپ هەڵبژێرە",
      uaeCeo: "بەڕێوەبەری ئیمارات",
      uaeTeam: "تیمی بازرگانی ئیمارات",
      iraqTeam: "تیمی بازرگانی عێراق",
      dubaiOffice: "نووسینگەی دوبەی",
      scroll: "خوارەوە بڕۆ",
    },
    catalogue: {
      home: "سەرەکی",
      productTypes: "جۆرەکانی بەرهەم",
      sourceToSpecification: "بەپێی داواکارییەکەتان دابین دەکەین.",
      quoteHint: "پاکی، بڕ و بەندەری مەبەستەکەتان بنێرن؛ تیمەکەمان بەردەستبوون و نرخی نوێتان بۆ دەنێرێت.",
    },
    footer: {
      index: "پەڕەکان",
      contact: "پەیوەندی",
      companyDescription: "دۆزینەوە، پرۆسەکردن و هەناردەکردنی کانزاکانی نافەڕەیی لەسەر کەنداوی فارس، ڕۆژهەڵاتی ناوەڕاست، چین و هیندستان.",
      backToTop: "گەڕانەوە بۆ سەرەوە",
    },
    home: {
      eyebrow: "دوبەی · عێراق · بازرگانی کانزاکانی نافەڕەیی لە جیهاندا",
      heroTitle: "کانزا پیشەی ئێمەیە",
      heroSubtitle: "متمانە بنەمای ئێمەیە",
      heroDescription: "مس، ئەڵۆمینیۆم، سەرب و برۆنز بۆ کۆمەڵگەی فۆندری، بەرهەمهێنەران و کۆکردنەوەکاران لە کەنداوی فارس و دەرەوە دابین و هەناردە دەکەین؛ ماددەی پاک، بازرگانی ڕوون و دابینکردنی جێگیر.",
      stats: ["وڵاتەکانی خزمەتکراو", "جۆری بەرهەم", "کڕیارە چالاکەکان", "ساڵانی بازرگانی"],
      whoWeAre: "ئێمە کێین",
      welcomeTitle: "ناوێکی متمانەپێکراو لە بازرگانی کانزاکانی نافەڕەیی",
      welcomeText: "کۆمپانیای جەلیل جەلالی بازرگانی کانزا کۆمپانیایەکی بنکەکراو لە ئیماراتە کە لە بازرگانی و هەناردەکردنی مس، ئەڵۆمینیۆم، سەرب، برۆنز و بەرهەمە پەیوەندیدارەکان کار دەکات. لە دوبەی و سلێمانیەوە پۆل و لۆجستیکی جێگیر دابین دەکەین.",
      fromTheYard: "لە کۆگاکەوە",
      yardTitle: "بۆ هەناردە بارکراوە، ئامادەی ژیانی داهاتوویەتی",
      catalogue: "کاتەلۆگی ئێمە",
      catalogueTitle: "ماددە لە جوڵەدا",
      whyChooseUs: "بۆچی ئێمە",
      reliabilityTitle: "لەسەر جێگیری، پۆل و متمانە دامەزراوین",
      ctaTitle: "ئامادەی دابینکردنی کانزای کوالێتی بەرزیت؟",
      ctaText: "پۆل، بڕ و شوێنی مەبەستەکەتان بنێرن؛ تیمی بازرگانی بە نرخی نوێ وەڵامتان دەداتەوە.",
      contactTeam: "پەیوەندی بە تیمەکەمانەوە",
    },
  },
  ar: {
    language: "العربية",
    languageEnglish: "Arabic",
    nav: { home: "الرئيسية", products: "المنتجات", industries: "القطاعات", about: "من نحن", contact: "اتصل بنا", menu: "القائمة" },
    products: { copper: "منتجات النحاس", aluminum: "منتجات الألمنيوم", other: "منتجات أخرى" },
    actions: {
      exploreProducts: "استكشف المنتجات",
      aboutUs: "من نحن",
      contactForPrice: "تواصل لمعرفة السعر",
      requestQuote: "اطلب عرض سعر",
      chatWhatsapp: "تواصل معنا عبر واتساب",
      whatsappUs: "واتساب",
      whatsappChoose: "اختر جهة اتصال واتساب",
      uaeCeo: "المدير التنفيذي - الإمارات",
      uaeTeam: "فريق التجارة - الإمارات",
      iraqTeam: "فريق التجارة - العراق",
      dubaiOffice: "مكتب دبي",
      scroll: "مرر للأسفل",
    },
    catalogue: {
      home: "الرئيسية",
      productTypes: "أنواع المنتجات",
      sourceToSpecification: "نوفر المواد حسب المواصفات المطلوبة.",
      quoteHint: "أرسل درجة النقاء والكمية وميناء الوجهة، وسيؤكد فريقنا التوفر ويرسل عرض سعر محدثاً.",
    },
    footer: {
      index: "روابط الموقع",
      contact: "اتصل بنا",
      companyDescription: "توريد ومعالجة وتصدير المعادن غير الحديدية عالية الجودة عبر الخليج العربي والشرق الأوسط والصين والهند.",
      backToTop: "العودة إلى الأعلى",
    },
    home: {
      eyebrow: "دبي · العراق · تجارة المعادن غير الحديدية حول العالم",
      heroTitle: "المعادن حرفتنا",
      heroSubtitle: "الثقة أساس عملنا",
      heroDescription: "نورد ونعالج ونصدر النحاس والألمنيوم والرصاص والنحاس الأصفر إلى المسابك والمصنعين وشركات إعادة التدوير في الخليج وخارجه، بمواد نظيفة وتجارة شفافة وإمداد موثوق.",
      stats: ["الدول التي نخدمها", "أنواع المنتجات", "العملاء النشطون", "سنوات الخبرة"],
      whoWeAre: "من نحن",
      welcomeTitle: "اسم موثوق في تجارة المعادن غير الحديدية",
      welcomeText: "جليل جلال لتجارة المعادن ذ.م.م. شركة مقرها دولة الإمارات ومتخصصة في تجارة وتصدير النحاس والألمنيوم والرصاص والنحاس الأصفر والمنتجات ذات الصلة. ومن دبي وعملياتنا في السليمانية، نوفر درجات ثابتة وخدمات لوجستية موثوقة.",
      fromTheYard: "من ساحة التحميل",
      yardTitle: "محمّلة للتصدير وجاهزة لدورة صناعية جديدة",
      catalogue: "كتالوجنا",
      catalogueTitle: "مواد تتحرك نحو مستقبل جديد",
      whyChooseUs: "لماذا نحن",
      reliabilityTitle: "نبني عملنا على الموثوقية والجودة والثقة",
      ctaTitle: "هل تبحث عن معادن عالية الجودة؟",
      ctaText: "أرسل الدرجة والكمية والوجهة، وسيرد فريق التجارة لدينا بعرض سعر محدث.",
      contactTeam: "تواصل مع فريقنا",
    },
  },
};

export const localeLabels: Record<Locale, string> = {
  en: "EN",
  ku: "KU",
  ar: "AR",
};
