import type { Metadata, Viewport } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import WhatsAppFloat from "@/components/WhatsAppFloat";
import ScrollReveal from "@/components/ScrollReveal";
import { site } from "@/lib/site";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-playfair",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://metal-uae.com"),
  title: {
    default: "Jalil Jalal Metals Trading L.L.C. — Non-Ferrous Metals Trade & Export",
    template: "%s · Jalil Jalal Metals Trading",
  },
  description:
    "UAE-based trading and export of non-ferrous metals — copper, aluminum, lead, brass and more — supplied to foundries, manufacturers and recyclers across the Gulf, Middle East, China and India.",
  keywords: [
    "copper scrap",
    "aluminum ingots",
    "non-ferrous metals",
    "metal trading Dubai",
    "lead ingots",
    "brass scrap",
    "metal export UAE",
  ],
  openGraph: {
    title: "Jalil Jalal Metals Trading L.L.C.",
    description:
      "Sourcing, processing and exporting premium non-ferrous metals across the Persian Gulf, Middle East, China & India.",
    type: "website",
    locale: "en_US",
    siteName: site.company,
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0D0F",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
      <body>
        {/* Without JS the reveal animations never fire — show everything. */}
        <noscript>
          <style>{`.reveal{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        <ScrollReveal />
        <Navbar />
        <main>{children}</main>
        <Footer />
        <WhatsAppFloat />
      </body>
    </html>
  );
}
