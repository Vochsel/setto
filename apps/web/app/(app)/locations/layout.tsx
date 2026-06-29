import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Locations",
};

export default function LocationsLayout({ children }: { children: ReactNode }) {
  return children;
}
