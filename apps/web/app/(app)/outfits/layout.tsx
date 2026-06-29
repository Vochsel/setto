import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Outfits",
};

export default function OutfitsLayout({ children }: { children: ReactNode }) {
  return children;
}
