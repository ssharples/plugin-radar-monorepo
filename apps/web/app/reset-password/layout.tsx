import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset Password | Plugin Radar",
  description: "Set a new password for your Plugin Radar account.",
};

export default function ResetPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
