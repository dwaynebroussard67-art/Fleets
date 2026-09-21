import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "FLEET — Your work. Your reputation.",
  description:
    "A home for independent drivers. Keep your reputation, log your work, and make every shift count.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
