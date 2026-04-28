"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ShieldCheck } from "lucide-react";
import { APP_NAME } from "@/lib/contracts";

export function Header() {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-zinc-900/80 bg-zinc-950/60 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="group flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-glow/30 bg-emerald-glow/10 text-emerald-glow shadow-[0_0_20px_-6px_rgba(52,211,153,0.5)]">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-zinc-100">
              {APP_NAME}
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-glow/70">
              Nox · ERC-7984 · TDX
            </div>
          </div>
        </Link>

        <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
      </div>
    </header>
  );
}
