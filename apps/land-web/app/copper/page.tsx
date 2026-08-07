import type { Metadata } from "next";
import ProductCategory from "@/components/ProductCategory";
import { copper } from "@/lib/data";

export const metadata: Metadata = {
  title: "Copper Products",
  description: copper.intro,
};

export default function CopperPage() {
  return <ProductCategory data={copper} />;
}
