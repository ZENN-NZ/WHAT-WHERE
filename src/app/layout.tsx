import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "WHAT-WHERE — Collaborative Workspace & Zero-Knowledge Vault",
  description:
    "Invite-only Notion-style collaborative workspace, relational databases, and client-side AES-256-GCM Zero-Knowledge Vault.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Reading headers opts dynamic pages into per-request CSP nonce propagation
  await headers();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
