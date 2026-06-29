import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Shoots",
};

export default function ShootsLayout({ children }: { children: ReactNode }) {
  return children;
}
