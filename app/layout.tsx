import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  return {
    metadataBase: new URL(origin),
    title: { default: "Motora ERP", template: "%s | Motora ERP" },
    description: "Gestão profissional de operação, estoque e financeiro para oficinas automotivas.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "Motora ERP",
      description: "Operação, compras, estoque e financeiro em um só fluxo.",
      type: "website",
      images: [{ url: `${origin}/og-phase3.png`, width: 1672, height: 941, alt: "Motora ERP - Fase 3, operação, compras e estoque" }],
    },
    twitter: { card: "summary_large_image", title: "Motora ERP", description: "Operação, compras, estoque e financeiro em um só fluxo.", images: [`${origin}/og-phase3.png`] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
