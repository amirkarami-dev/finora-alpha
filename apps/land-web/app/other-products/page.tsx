import type { Metadata } from "next";
import ProductCategory from "@/components/ProductCategory";
import { otherProducts } from "@/lib/data";

export const metadata: Metadata = {
  title: "Other Products — Lead, Brass & Specialty Metals",
  description: otherProducts.intro,
};

export default function OtherProductsPage() {
  return <ProductCategory data={otherProducts} />;
}
