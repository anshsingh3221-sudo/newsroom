import AuthLinks from "@/components/AuthLinks";
// …
<Header auth={<AuthLinks />} />
import type { Metadata } from "next";
import { Newsreader, Public_Sans } from "next/font/google";
import { Footer, Header } from "@/components/Shell";
import "./globals.css";

const serif = Newsreader({ subsets: ["latin"], variable: "--font-serif", display: "swap" });
const sans = Public_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: "The Record", template: "%s | The Record" },
  description: "Evidence-based news analysis, fact-checks and a searchable archive of public statements.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>
        <a href="#main" className="ui sr-only focus:not-sr-only focus:absolute focus:bg-white focus:p-2">Skip to content</a>
        <Header />
        <main id="main" className="mx-auto max-w-6xl px-4 py-10">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
