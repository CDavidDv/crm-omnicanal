import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM Omnicanal",
  description:
    "CRM de ventas sobre WhatsApp, Messenger e Instagram — solo APIs oficiales de Meta",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
