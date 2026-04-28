"use client";

import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { arbitrumSepolia } from "wagmi/chains";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NetworkBanner() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  if (!isConnected) return null;
  if (chainId === arbitrumSepolia.id) return null;

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-200">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-start gap-2 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            You're connected to chain <code>{chainId}</code>. The vault lives on
            Arbitrum Sepolia (chainId 421614).
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => switchChain({ chainId: arbitrumSepolia.id })}
          className="border-amber-400/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
        >
          Switch to Arbitrum Sepolia
        </Button>
      </div>
    </div>
  );
}
