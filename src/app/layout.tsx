import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AFI Knowledge",
  description: "Live Chat command center untuk pedoman AFI",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
