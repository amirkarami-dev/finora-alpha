import type { Metadata } from "next";
import ProductCategory from "@/components/ProductCategory";
import { aluminum } from "@/lib/data";

export const metadata: Metadata = {
  title: "Aluminum Products",
  description: aluminum.intro,
};

export default function AluminumPage() {
  return <ProductCategory data={aluminum} />;
}
