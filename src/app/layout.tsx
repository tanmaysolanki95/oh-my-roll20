import type { Metadata } from "next";
import { Geist, Geist_Mono, Cinzel, Crimson_Text, Rajdhani, Exo_2 } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const cinzel    = Cinzel({ variable: "--font-cinzel-loaded", subsets: ["latin"], weight: ["400", "600", "700", "900"] });
const crimson   = Crimson_Text({ variable: "--font-crimson-loaded", subsets: ["latin"], weight: ["400", "600"] });
const rajdhani  = Rajdhani({ variable: "--font-rajdhani-loaded", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const exo2      = Exo_2({ variable: "--font-exo2-loaded", subsets: ["latin"], weight: ["300", "400", "600", "700"] });

export const metadata: Metadata = {
  title: "oh-my-roll20",
  description: "A VTT for friends",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} ${crimson.variable} ${rajdhani.variable} ${exo2.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" data-theme="grimoire">
        {children}
      </body>
    </html>
  );
}
