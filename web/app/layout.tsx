import type { Metadata } from "next";
import { Hanken_Grotesk, Newsreader } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Newsreader: editorial serif for page titles and big numerals. Hanken Grotesk: quiet UI sans.
const display = Newsreader({ variable: "--nf-display", subsets: ["latin"], axes: ["opsz"], display: "swap" });
const ui = Hanken_Grotesk({ variable: "--nf-ui", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Arc", template: "%s | Arc" },
  description: "Home stroke rehabilitation, measured. Patient and clinician portal.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${ui.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><Providers>{children}</Providers></body>
    </html>
  );
}
