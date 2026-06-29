import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Queue",
};

export default function QueueLayout({ children }: { children: ReactNode }) {
  return children;
}
