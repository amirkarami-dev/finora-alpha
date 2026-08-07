import type { Metadata } from "next";
import IndustriesView from "@/components/IndustriesView";

export const metadata: Metadata = {
  title: "Industries We Serve",
  description:
    "Foundries & smelters, cable manufacturers, recyclers, battery & energy, construction and metal traders — the six core sectors we supply across the Gulf and Asia.",
};

export default function IndustriesPage() {
  return <IndustriesView />;
}
