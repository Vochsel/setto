import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Shoot",
};

export default function ShootDetailLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
