import type { Metadata } from "next";
import { Geist_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-sans" });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Custos Aquae — Flood Detection & Water Quality Monitor",
  description:
    "Real-time flood detection and water quality monitoring dashboard powered by ESP32 sensors and MQTT.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full antialiased",
        manrope.variable,
        geistMono.variable,
        "font-sans"
      )}
    >
      <body className="min-h-full flex flex-col bg-background">{children}</body>
    </html>
  );
}
