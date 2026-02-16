import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account | Plugin Radar",
  description: "Manage your Plugin Radar account settings.",
};

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
