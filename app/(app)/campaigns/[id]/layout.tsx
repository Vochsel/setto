import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Campaign",
};

export default function CampaignDetailLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
