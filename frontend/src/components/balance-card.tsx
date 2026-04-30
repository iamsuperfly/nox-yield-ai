"use client";

import { useAccount, useReadContract } from "wagmi";
import { Lock, Eye, EyeOff, Copy, Check } from "lucide-react";
import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { erc7984Abi } from "@/lib/abis";
import { SHARE_TOKEN_ADDRESS, isVaultConfigured } from "@/lib/contracts";

const ZERO_HANDLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

export function BalanceCard() {
  const { address, isConnected } = useAccount();
  const [revealed, setRevealed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const { data: handle, isFetching } = useReadContract({
    address: SHARE_TOKEN_ADDRESS,
    abi: erc7984Abi,
    functionName: "confidentialBalanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && isVaultConfigured(), refetchInterval: 12_000 },
  });

  const handleHex = (handle as `0x${string}` | undefined) ?? undefined;
  const hasHandle = !!handleHex && handleHex !== ZERO_HANDLE;

  // Auto-collapse when wallet disconnects or there is nothing to reveal.
  React.useEffect(() => {
    if (!isConnected || !hasHandle) setRevealed(false);
  }, [isConnected, hasHandle]);

  async function copyHandle() {
    if (!handleHex) return;
    try {
      await navigator.clipboard.writeText(handleHex);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-sm font-medium text-zinc-400">
            Confidential Balance
          </CardTitle>
          <CardDescription>
            Your vault position is encrypted on-chain (ERC-7984 ciphertext handle).
          </CardDescription>
        </div>
        <Badge variant="default" className="shrink-0">
          <Lock className="h-3 w-3" />
          Encrypted
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="font-mono text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
              {!isConnected ? (
                <span className="text-zinc-600">— · —</span>
              ) : (
                <span aria-label="encrypted balance">
                  ●●●●●●●●●●●●●●●●{" "}
                  <span className="text-zinc-400 text-2xl sm:text-3xl">cFORT</span>
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {!isConnected
                ? "Connect a wallet to view your encrypted handle."
                : isFetching && !handleHex
                ? "Reading ciphertext handle…"
                : hasHandle
                ? "Encrypted ERC-7984 share handle."
                : "No handle yet — make a deposit to mint encrypted shares."}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!isConnected || !hasHandle}
            onClick={() => setRevealed((v) => !v)}
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {revealed ? "Hide" : "Request reveal"}
          </Button>
        </div>

        {revealed && hasHandle && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">
              Ciphertext handle (bytes32)
            </div>
            <div className="break-all rounded bg-zinc-900/60 px-2 py-1.5 font-mono text-xs text-zinc-200">
              {handleHex}
            </div>
            <div className="mt-2 flex items-center justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={copyHandle}
                title="Copy handle"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> Copy handle
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
