"use client";

import * as React from "react";
import { useAccount } from "wagmi";
import { Droplets, ExternalLink, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { txUrl } from "@/lib/contracts";

type FaucetState =
  | { kind: "idle" }
  | { kind: "loading"; amount: 1000 | 5000 }
  | { kind: "success"; txHash: `0x${string}`; amount: number }
  | { kind: "error"; message: string };

export function FaucetCard() {
  const { address, isConnected } = useAccount();
  const [state, setState] = React.useState<FaucetState>({ kind: "idle" });

  async function drip(amount: 1000 | 5000) {
    if (!address) return;
    setState({ kind: "loading", amount });
    try {
      const r = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: address, amount }),
      });
      const data = (await r.json()) as
        | { ok: true; txHash: `0x${string}` }
        | { ok: false; error: string };
      if (!r.ok || !data.ok) {
        setState({ kind: "error", message: ("error" in data && data.error) || `HTTP ${r.status}` });
        return;
      }
      setState({ kind: "success", txHash: data.txHash, amount });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Network error",
      });
    }
  }

  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-500/[0.06] via-transparent to-transparent" />
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Droplets className="h-4 w-4 text-sky-400" />
            Test cUSD faucet
          </CardTitle>
          <CardDescription>
            Mint encrypted test cUSD straight to your wallet so you can deposit
            into the vault.
          </CardDescription>
        </div>
        <Badge variant="info">Testnet</Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            size="lg"
            disabled={!isConnected || state.kind === "loading"}
            onClick={() => drip(1000)}
          >
            {state.kind === "loading" && state.amount === 1000 ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Mint 1,000 cUSD
          </Button>
          <Button
            size="lg"
            disabled={!isConnected || state.kind === "loading"}
            onClick={() => drip(5000)}
          >
            {state.kind === "loading" && state.amount === 5000 ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Mint 5,000 cUSD
          </Button>
        </div>

        {!isConnected && (
          <p className="text-xs text-zinc-500">Connect a wallet to use the faucet.</p>
        )}

        {state.kind === "success" && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-glow/30 bg-emerald-glow/10 px-3 py-2 text-xs text-emerald-glow">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="flex-1">
              Minted <span className="font-semibold">{state.amount.toLocaleString()} cUSD</span> — your encrypted balance handle has rotated.
            </span>
            <a
              href={txUrl(state.txHash)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
            >
              tx <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}

        {state.kind === "error" && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{state.message}</span>
          </div>
        )}

        <p className="text-[11px] text-zinc-500">
          One drip per address every 30 s. Demo only — testnet cUSD has no value.
        </p>
      </CardContent>
    </Card>
  );
}
