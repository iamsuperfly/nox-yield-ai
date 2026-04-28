"use client";

import { useReadContract } from "wagmi";
import { Layers } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { vaultAbi } from "@/lib/abis";
import { VAULT_ADDRESS, isVaultConfigured, strategyIdToLabel } from "@/lib/contracts";
import { shortHash } from "@/lib/utils";

export function PortfolioCard() {
  const { data, isFetching } = useReadContract({
    address: VAULT_ADDRESS,
    abi: vaultAbi,
    functionName: "getEncryptedPortfolio",
    query: { enabled: isVaultConfigured(), refetchInterval: 12_000 },
  });

  const ids     = (data?.[0] as readonly string[] | undefined) ?? [];
  const weights = (data?.[1] as readonly string[] | undefined) ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-emerald-glow" />
            Encrypted portfolio
          </CardTitle>
          <CardDescription>
            Strategy slots are public; per-slot weights are ciphertext handles
            committed by the TEE.
          </CardDescription>
        </div>
        <Badge variant="default">Ciphertext</Badge>
      </CardHeader>
      <CardContent>
        {!isVaultConfigured() ? (
          <EmptyState text="Configure NEXT_PUBLIC_VAULT_ADDRESS to read on-chain portfolio handles." />
        ) : ids.length === 0 ? (
          <EmptyState text={isFetching ? "Reading…" : "No strategies registered yet."} />
        ) : (
          <ul className="divide-y divide-zinc-800">
            {ids.map((id, i) => (
              <li key={id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div>
                  <div className="text-sm font-medium text-zinc-100">{strategyIdToLabel(id)}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-zinc-500">{shortHash(id)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">weight handle</div>
                  <div className="mt-0.5 font-mono text-xs text-emerald-glow/90">{shortHash(weights[i])}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950/40 p-6 text-center text-sm text-zinc-500">
      {text}
    </div>
  );
}
