import type { Metadata } from "next";
import ContactView from "@/components/ContactView";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Reach the Jalil Jalal Metals trade desk by phone, email or WhatsApp, or send an inquiry. Offices in Dubai, UAE and Sulaymaniyah, Iraq.",
};

export default function ContactPage() {
  return <ContactView />;
}
