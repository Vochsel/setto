import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Model",
};

export default function ModelDetailLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
