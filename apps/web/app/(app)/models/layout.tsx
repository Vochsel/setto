import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Models",
};

export default function ModelsLayout({ children }: { children: ReactNode }) {
  return children;
}
