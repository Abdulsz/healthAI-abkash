import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Patient's Agent",
  description:
    "Everyone at the table already has an agent — the hospital, the clinic, the insurer. Everyone except the patient. This is theirs.",
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
