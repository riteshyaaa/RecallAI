import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "RecallAI | Research with memory",
  description: "A memory-aware web search assistant.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
