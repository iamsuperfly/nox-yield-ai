import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Confidential AI Yield Fortress",
  description:
    "Private institutional yield vault on Arbitrum Sepolia. Encrypted ERC-7984 deposits, AI-driven rebalancing inside an iExec Nox TDX TEE.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="relative">
        <Providers>
          <div className="relative z-10">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
