import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIR — AI Reviewer",
  description: "Serverless GitHub App for AI-powered pull request reviews",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
