import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "vlog",
  description: "Todo lo grabado, leído en un solo sitio.",
  // Static files, not `app/icon.*`: no extra routes. The apple one is square, iOS rounds it.
  icons: { icon: "/icon.png", apple: "/apple-icon.png" },
  appleWebApp: { title: "vlog", statusBarStyle: "default" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${inter.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
