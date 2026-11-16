import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrustShare - Intelligent Encrypted File Sharing Platform",
  description: "Secure AES-256-GCM encrypted file sharing and collaboration platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="min-h-full flex flex-col font-sans bg-slate-950 text-slate-100">{children}</body>
    </html>
  );
}
