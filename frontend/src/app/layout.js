import "./globals.css";

export const metadata = {
  title: "TrustShare - Intelligent Encrypted File Sharing & Digital Collaboration Platform",
  description: "Enterprise-grade AES-256 encrypted file sharing and collaboration platform",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
