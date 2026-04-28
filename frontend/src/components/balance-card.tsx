"use client";

import { useAccount, useReadContract } from "wagmi";
import { Lock, Eye, EyeOff } from "lucide-react";
import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { erc7984Abi } from "@/lib/abis";
import { SHARE_TOKEN_ADDRESS, isVaultConfigured } from "@/lib/contracts";
import { shortHash } from "@/lib/utils";

export function BalanceCard() {
  const { address, isConnected } = useAccount();
  const [revealed, setRevealed] = React.useState(false);

  const { data: handle, isFetching } = useReadContract({
    address: SHARE_TOKEN_ADDRESS,
    abi: erc7984Abi,
    functionName: "confidentialBalanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && isVaultConfigured(), refetchInterval: 12_000 },
  });

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
      <CardContent>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="font-mono text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
              {!isConnected ? (
                <span className="text-zinc-600">— · —</span>
              ) : revealed ? (
                <span className="text-emerald-glow">
                  {/* In BUILD 2 the TEE returns a re-encrypted plaintext. */}
                  ●●●● cFORT
                </span>
              ) : (
                <span aria-label="hidden balance">●●●●●●●●</span>
              )}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {isFetching ? (
                "Reading ciphertext handle…"
              ) : handle ? (
                <span>
                  handle{" "}
                  <span className="font-mono text-zinc-400">{shortHash(handle as string)}</span>
                </span>
              ) : isConnected ? (
                "No handle yet — make a deposit to mint encrypted shares."
              ) : (
                "Connect a wallet to view your encrypted handle."
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!isConnected}
            onClick={() => setRevealed((v) => !v)}
            title="Requesting plaintext requires a TEE re-encryption permit (BUILD 2)"
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {revealed ? "Hide" : "Request reveal"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
