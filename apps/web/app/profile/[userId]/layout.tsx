import { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ userId: string }>;
}): Promise<Metadata> {
  await params;
  return {
    title: "User Profile | Plugin Radar",
    description: "View user profile, shared plugin chains, and activity on Plugin Radar.",
  };
}

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
