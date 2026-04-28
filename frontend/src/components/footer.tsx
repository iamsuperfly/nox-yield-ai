import { addrUrl, ASSET_TOKEN_ADDRESS, SHARE_TOKEN_ADDRESS, VAULT_ADDRESS, isVaultConfigured } from "@/lib/contracts";
import { ExternalLink } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-zinc-900/80">
      <div className="container flex flex-col items-start justify-between gap-6 py-8 text-xs text-zinc-500 sm:flex-row sm:items-center">
        <div>
          Confidential AI Yield Fortress · Arbitrum Sepolia · iExec Nox TDX
          {!isVaultConfigured() && (
            <span className="ml-2 text-amber-400/80">
              (vault address not configured)
            </span>
          )}
        </div>
        {isVaultConfigured() && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono">
            <Link label="vault"  addr={VAULT_ADDRESS}        />
            <Link label="cUSD"   addr={ASSET_TOKEN_ADDRESS}  />
            <Link label="cFORT"  addr={SHARE_TOKEN_ADDRESS}  />
          </div>
        )}
      </div>
    </footer>
  );
}

function Link({ label, addr }: { label: string; addr: `0x${string}` }) {
  return (
    <a
      href={addrUrl(addr)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 hover:text-emerald-glow"
    >
      {label} {addr.slice(0, 6)}…{addr.slice(-4)}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
