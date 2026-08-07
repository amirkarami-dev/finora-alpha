import { site } from "@/lib/site";
import { WhatsAppGlyph } from "./icons";

export default function WhatsAppFloat() {
  return (
    <a className="float-cta" href={site.whatsapp} target="_blank" rel="noopener" aria-label="Chat with us on WhatsApp">
      <WhatsAppGlyph width={30} height={30} style={{ color: "#fff" }} />
      <span>Chat with us</span>
    </a>
  );
}
