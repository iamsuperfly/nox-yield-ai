"use client";

import * as React from "react";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
  useWatchContractEvent,
} from "wagmi";
import { CircuitBoard, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { vaultAbi } from "@/lib/abis";
import { VAULT_ADDRESS, isVaultConfigured, txUrl } from "@/lib/contracts";
import { shortHash } from "@/lib/utils";

type Phase = "idle" | "broadcasting" | "thinking" | "fulfilled";

export function RebalanceCard() {
  const { address } = useAccount();
  const [tx, setTx] = React.useState<`0x${string}` | undefined>();
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [lastFulfilledRoot, setLastFulfilledRoot] = React.useState<string | undefined>();

  const { writeContractAsync, isPending } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } =
    useWaitForTransactionReceipt({ hash: tx });

  const { data: pendingId } = useReadContract({
    address: VAULT_ADDRESS,
    abi: vaultAbi,
    functionName: "pendingRebalanceId",
    query: { enabled: isVaultConfigured(), refetchInterval: 8_000 },
  });

  const { data: completedId } = useReadContract({
    address: VAULT_ADDRESS,
    abi: vaultAbi,
    functionName: "completedRebalanceId",
    query: { enabled: isVaultConfigured(), refetchInterval: 8_000 },
  });

  // When the broadcast is confirmed, flip to "thinking" while we wait for
  // the TEE worker to fulfil. The watcher below resolves to "fulfilled".
  React.useEffect(() => {
    if (confirmed && phase === "broadcasting") setPhase("thinking");
  }, [confirmed, phase]);

  useWatchContractEvent({
    address: VAULT_ADDRESS,
    abi: vaultAbi,
    eventName: "RebalanceFulfilled",
    enabled: isVaultConfigured(),
    onLogs: (logs) => {
      const last = logs[logs.length - 1];
      if (last && last.args && "newPortfolioHandle" in last.args) {
        setLastFulfilledRoot(last.args.newPortfolioHandle as string);
        setPhase("fulfilled");
      }
    },
  });

  async function onTrigger() {
    try {
      setPhase("broadcasting");
      const hash = await writeContractAsync({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: "requestRebalance",
      });
      setTx(hash);
    } catch (err) {
      console.error(err);
      setPhase("idle");
    }
  }

  const pending   = Number(pendingId   ?? 0n);
  const completed = Number(completedId ?? 0n);
  const inFlight  = pending > completed;

  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-glow/[0.06] via-transparent to-transparent" />
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-glow" />
            AI Rebalance
          </CardTitle>
          <CardDescription>
            Triggers the Yield Fortress Optimizer running inside an iExec Nox
            TDX enclave.
          </CardDescription>
        </div>
        <Badge variant={inFlight ? "warn" : "secondary"}>
          {inFlight ? "In flight" : "Idle"}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Stat label="Pending id"   value={String(pending)}   />
          <Stat label="Completed id" value={String(completed)} />
        </div>

        <Button
          className="w-full"
          size="lg"
          disabled={!address || !isVaultConfigured() || isPending || phase !== "idle"}
          onClick={onTrigger}
        >
          {phase === "idle"         && (<><CircuitBoard className="h-4 w-4" /> Request AI rebalance</>)}
          {phase === "broadcasting" && (<><Loader2 className="h-4 w-4 animate-spin" /> Broadcasting tx…</>)}
          {phase === "thinking"     && (<><Loader2 className="h-4 w-4 animate-spin" /> AI Agent is optimizing in TEE…</>)}
          {phase === "fulfilled"    && (<><Sparkles className="h-4 w-4" /> Rebalance fulfilled — request again</>)}
        </Button>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium uppercase tracking-wider text-zinc-500">
              Status
            </span>
            <span className={statusDotClass(phase)} />
          </div>
          <p className="text-zinc-400">
            {phase === "idle"         && "Awaiting trigger. Anyone can request a rebalance once the cool-down has elapsed."}
            {phase === "broadcasting" && "Submitting requestRebalance() to Arbitrum Sepolia."}
            {phase === "thinking"     && "TDX worker has picked up the request, decrypted the portfolio inside the enclave, and is querying the live yield feed."}
            {phase === "fulfilled"    && (<>New portfolio commitment <span className="font-mono text-emerald-glow">{shortHash(lastFulfilledRoot)}</span> — weights remain encrypted on-chain.</>)}
          </p>
        </div>

        {tx && (
          <a
            href={txUrl(tx)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-emerald-glow hover:underline"
          >
            {confirming ? "Confirming…" : confirmed ? "View confirmed tx" : "View tx"}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-0.5 font-mono text-lg font-semibold text-zinc-100">{value}</div>
    </div>
  );
}

function statusDotClass(phase: Phase) {
  const base = "inline-block h-2 w-2 rounded-full";
  switch (phase) {
    case "idle":         return `${base} bg-zinc-600`;
    case "broadcasting": return `${base} bg-amber-400 animate-pulse-soft`;
    case "thinking":     return `${base} bg-emerald-glow animate-glow`;
    case "fulfilled":    return `${base} bg-emerald-glow`;
  }
}
