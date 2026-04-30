"use client";

import { useAccount, useReadContract } from "wagmi";
import { Lock, Eye, EyeOff, Copy, ExternalLink, Check, ShieldCheck } from "lucide-react";
import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { erc7984Abi } from "@/lib/abis";
import {
  SHARE_TOKEN_ADDRESS,
  isVaultConfigured,
  ARBITRUM_SEPOLIA_EXPLORER,
} from "@/lib/contracts";
import { shortHash } from "@/lib/utils";

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

  // Arbiscan exposes view functions on the contract's "Read Contract" tab.
  // We deep-link to the share-token (cFORT) page so the user can call
  // confidentialBalanceOf(address) themselves and verify the same handle.
  const arbiscanReadUrl = `${ARBITRUM_SEPOLIA_EXPLORER}/address/${SHARE_TOKEN_ADDRESS}#readContract`;

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
              ) : isFetching && !handleHex ? (
                <span className="text-zinc-600">…</span>
              ) : hasHandle ? (
                <span className="text-emerald-glow">
                  {shortHash(handleHex)}{" "}
                  <span className="text-zinc-400 text-2xl sm:text-3xl">cFORT</span>
                </span>
              ) : (
                <span className="text-zinc-500 text-2xl sm:text-3xl">
                  No cFORT yet
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {!isConnected ? (
                "Connect a wallet to view your encrypted handle."
              ) : isFetching && !handleHex ? (
                "Reading ciphertext handle…"
              ) : hasHandle ? (
                <>
                  Encrypted ERC-7984 share handle.{" "}
                  {revealed && (
                    <span className="text-emerald-glow">
                      Plaintext reveal requires a TEE re-encryption permit.
                    </span>
                  )}
                </>
              ) : (
                "No handle yet — make a deposit to mint encrypted shares."
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!isConnected || !hasHandle}
            onClick={() => setRevealed((v) => !v)}
            title="Requesting plaintext requires a TEE re-encryption permit"
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {revealed ? "Hide" : "Request reveal"}
          </Button>
        </div>

        {/* Verify on-chain panel */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-500">
            <ShieldCheck className="h-3 w-3 text-emerald-glow" />
            Verify on-chain
          </div>
          <div className="space-y-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                Raw 32-byte ciphertext handle
              </div>
              <div className="mt-1 break-all rounded bg-zinc-900/60 px-2 py-1.5 font-mono text-xs text-zinc-300">
                {hasHandle
                  ? handleHex
                  : isConnected
                  ? "0x0000…0000  (no deposit yet)"
                  : "Connect wallet to read your handle"}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!hasHandle}
                onClick={copyHandle}
                title="Copy raw handle"
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
              <a
                href={arbiscanReadUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-300 hover:border-emerald-glow/40 hover:text-emerald-glow"
                title="Open the share-token Read Contract tab on Arbiscan and call confidentialBalanceOf(address)"
              >
                Read confidentialBalanceOf on Arbiscan
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-500">
              Anyone can call <span className="font-mono text-zinc-400">confidentialBalanceOf(address)</span>{" "}
              on the cFORT share token and get the exact same{" "}
              <span className="font-mono text-zinc-400">bytes32</span> handle —
              proving the vault holds your encrypted shares without revealing
              the plaintext amount.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
