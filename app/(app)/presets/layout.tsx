import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Presets",
};

export default function PresetsLayout({ children }: { children: ReactNode }) {
  return children;
}
