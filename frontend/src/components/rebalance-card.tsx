"use client";

import * as React from "react";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
  useWatchContractEvent,
} from "wagmi";
import {
  CircuitBoard,
  ExternalLink,
  Loader2,
  Sparkles,
  Activity,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { vaultAbi } from "@/lib/abis";
import { VAULT_ADDRESS, isVaultConfigured, txUrl } from "@/lib/contracts";
import { shortHash } from "@/lib/utils";

type Phase =
  | "idle"
  | "broadcasting"
  | "thinking"
  | "fulfilling"
  | "fulfilled"
  | "error";

interface PriceQuote {
  pair: string;
  feed: `0x${string}`;
  price: number;
  ageSeconds: number;
}
interface Allocation {
  strategy: string;
  weightBps: number;
}
interface RebalanceResult {
  ok: true;
  txHash: `0x${string}`;
  rebalanceId: string;
  portfolioRoot: `0x${string}`;
  prices: PriceQuote[];
  plan: {
    expectedApyBps: number;
    reason: string;
    marketCommentary: string;
    allocations: Allocation[];
  };
}

const STRATEGY_LABELS: Record<string, string> = {
  US_TBILL_3M: "T-Bills 3M",
  INVESTMENT_GRADE_CORP_BOND: "IG Bonds",
  PRIVATE_CREDIT_DIRECT: "Private Credit",
  TOKENISED_MMF: "Tokenised MMF",
};

export function RebalanceCard() {
  const { address } = useAccount();
  const [requestTx, setRequestTx] = React.useState<`0x${string}` | undefined>();
  const [fulfilTx,  setFulfilTx]  = React.useState<`0x${string}` | undefined>();
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = React.useState<string | undefined>();
  const [result, setResult] = React.useState<RebalanceResult | undefined>();
  const [livePrices, setLivePrices] = React.useState<PriceQuote[]>([]);
  const [hydrated, setHydrated] = React.useState(false);

  // Hydrate the last successful rebalance from localStorage so the AI
  // decision + portfolio commitment + tx links survive a page refresh
  // and remain visible even before the wallet reconnects.
  React.useEffect(() => {
    try {
      const raw = typeof window !== "undefined"
        ? window.localStorage.getItem("nox.lastRebalance.v1")
        : null;
      if (raw) {
        const saved = JSON.parse(raw) as {
          result?: RebalanceResult;
          requestTx?: `0x${string}`;
          fulfilTx?: `0x${string}`;
        };
        if (saved.result) {
          setResult(saved.result);
          setPhase("fulfilled");
        }
        if (saved.requestTx) setRequestTx(saved.requestTx);
        if (saved.fulfilTx)  setFulfilTx(saved.fulfilTx);
      }
    } catch {
      /* ignore parse / storage errors */
    } finally {
      setHydrated(true);
    }
  }, []);

  // Persist the last successful rebalance whenever it changes.
  React.useEffect(() => {
    if (!hydrated) return;
    if (phase !== "fulfilled" || !result) return;
    try {
      window.localStorage.setItem(
        "nox.lastRebalance.v1",
        JSON.stringify({ result, requestTx, fulfilTx }),
      );
    } catch {
      /* ignore quota / storage errors */
    }
  }, [hydrated, phase, result, requestTx, fulfilTx]);

  // Snapshot of pendingRebalanceId / completedRebalanceId at the moment
  // we triggered this run. Used so we can detect on-chain progress via
  // polling without relying solely on useWaitForTransactionReceipt or
  // useWatchContractEvent (both of which are flaky on public RPCs).
  const pendingSnapshotRef = React.useRef<bigint | null>(null);
  const completedSnapshotRef = React.useRef<bigint | null>(null);
  const agentStartedRef = React.useRef(false);

  const { writeContractAsync, isPending } = useWriteContract();
  const { isSuccess: requestConfirmed } = useWaitForTransactionReceipt({
    hash: requestTx,
  });
  const { isSuccess: fulfilConfirmed } = useWaitForTransactionReceipt({
    hash: fulfilTx,
  });

  // Poll quickly while a rebalance is in flight so the UI doesn't get stuck
  // on "Submitting encrypted weights on-chain…" if the event watcher misses
  // the log. Slow down to the normal cadence otherwise.
  const inFlightPhase =
    phase === "broadcasting" || phase === "thinking" || phase === "fulfilling";
  const pollInterval = inFlightPhase ? 3_000 : 8_000;

  const { data: pendingId } = useReadContract({
    address: VAULT_ADDRESS,
    abi: vaultAbi,
    functionName: "pendingRebalanceId",
    query: { enabled: isVaultConfigured(), refetchInterval: pollInterval },
  });
  const { data: completedId } = useReadContract({
    address: VAULT_ADDRESS,
    abi: vaultAbi,
    functionName: "completedRebalanceId",
    query: { enabled: isVaultConfigured(), refetchInterval: pollInterval },
  });

  // Poll the oracle endpoint for the live prices strip.
  React.useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const r = await fetch("/api/rebalance");
        const d = (await r.json()) as { ok: boolean; prices?: PriceQuote[] };
        if (!cancelled && d.ok && d.prices) setLivePrices(d.prices);
      } catch {
        /* ignore */
      }
    }
    tick();
    const id = setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // After requestRebalance is mined, kick off the agent.
  // We use TWO independent signals so we never get stuck in "broadcasting":
  //   (a) useWaitForTransactionReceipt resolving (fast path, but flaky on
  //       public Arb Sepolia RPCs)
  //   (b) pendingRebalanceId polling advancing past the snapshot we took
  //       at trigger time (reliable fallback)
  React.useEffect(() => {
    if (phase !== "broadcasting") return;
    const pendingNow = (pendingId as bigint | undefined) ?? 0n;
    const snap = pendingSnapshotRef.current;
    const advanced = snap !== null && pendingNow > snap;
    if ((requestConfirmed || advanced) && !agentStartedRef.current) {
      agentStartedRef.current = true;
      setPhase("thinking");
      void runAgent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestConfirmed, pendingId, phase]);

  // Fast path: WebSocket-style event subscription. Often misses logs on
  // public Arbitrum Sepolia RPCs, so it is paired with the polling effect
  // below as a reliable fallback.
  useWatchContractEvent({
    address: VAULT_ADDRESS,
    abi: vaultAbi,
    eventName: "RebalanceFulfilled",
    enabled: isVaultConfigured(),
    onLogs: () => {
      if (phase === "fulfilling" || phase === "thinking") setPhase("fulfilled");
    },
  });

  // Reliable fallback: while a rebalance is in flight, watch the
  // completedRebalanceId view function. As soon as it advances past the
  // snapshot we took at trigger time, the rebalance has been fulfilled
  // on-chain even if our event subscription dropped the log.
  React.useEffect(() => {
    if (completedId === undefined || completedId === null) return;
    const current = completedId as bigint;
    const snap = completedSnapshotRef.current;
    if (snap === null) return;
    if (
      current > snap &&
      (phase === "fulfilling" || phase === "thinking" || phase === "broadcasting")
    ) {
      setPhase("fulfilled");
    }
  }, [completedId, phase]);

  // Belt-and-braces: if we know the fulfil tx hash, treat its on-chain
  // confirmation as the success signal too.
  React.useEffect(() => {
    if (fulfilConfirmed && (phase === "fulfilling" || phase === "thinking")) {
      setPhase("fulfilled");
    }
  }, [fulfilConfirmed, phase]);

  async function runAgent() {
    setPhase("fulfilling");
    try {
      const r = await fetch("/api/rebalance", { method: "POST" });
      const data = (await r.json()) as
        | RebalanceResult
        | { ok: false; error: string };
      if (!r.ok || !("ok" in data) || !data.ok) {
        const msg = ("error" in data && data.error) || `HTTP ${r.status}`;
        setErrorMsg(msg);
        setPhase("error");
        return;
      }
      setResult(data);
      setFulfilTx(data.txHash);
      // event watcher will flip to "fulfilled"
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Network error");
      setPhase("error");
    }
  }

  async function onTrigger() {
    setErrorMsg(undefined);
    setResult(undefined);
    setFulfilTx(undefined);
    setRequestTx(undefined);
    // Capture the current pending + completed ids so the polling effects
    // can detect both broadcast confirmation and rebalance fulfilment
    // even if useWaitForTransactionReceipt / event watcher misfire.
    pendingSnapshotRef.current = (pendingId as bigint | undefined) ?? 0n;
    completedSnapshotRef.current = (completedId as bigint | undefined) ?? 0n;
    agentStartedRef.current = false;
    try {
      setPhase("broadcasting");
      const hash = await writeContractAsync({
        address: VAULT_ADDRESS,
        abi: vaultAbi,
        functionName: "requestRebalance",
      });
      setRequestTx(hash);
    } catch (err) {
      console.error(err);
      const msg =
        err instanceof Error
          ? err.message.split("\n")[0]
          : "Transaction rejected";
      setErrorMsg(msg);
      setPhase("error");
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
            Triggers the Yield Fortress Optimizer (Groq llama-3.3-70b) with
            live Chainlink oracle prices, then writes encrypted weights to the
            vault.
          </CardDescription>
        </div>
        <Badge
          variant={
            inFlight
              ? "warn"
              : phase === "fulfilled"
              ? "default"
              : "secondary"
          }
        >
          {inFlight
            ? "In flight"
            : phase === "fulfilled"
            ? "Done"
            : "Idle"}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Live Chainlink prices strip */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-500">
            <Activity className="h-3 w-3" />
            Live Chainlink feeds (Arb Sepolia)
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(livePrices.length ? livePrices : [
              { pair: "ETH/USD",  price: 0, ageSeconds: 0, feed: "0x" as `0x${string}` },
              { pair: "BTC/USD",  price: 0, ageSeconds: 0, feed: "0x" as `0x${string}` },
              { pair: "USDC/USD", price: 0, ageSeconds: 0, feed: "0x" as `0x${string}` },
            ]).map((p) => (
              <div key={p.pair} className="rounded-md bg-zinc-900/60 px-2 py-1.5">
                <div className="text-[10px] text-zinc-500">{p.pair}</div>
                <div className="font-mono text-sm font-semibold text-zinc-100">
                  {p.price > 0
                    ? p.price.toLocaleString(undefined, {
                        maximumFractionDigits: p.pair.startsWith("USDC") ? 4 : 2,
                      })
                    : "…"}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Stat label="Pending id"   value={String(pending)}   />
          <Stat label="Completed id" value={String(completed)} />
        </div>

        <Button
          className="w-full"
          size="lg"
          disabled={
            !address ||
            !isVaultConfigured() ||
            isPending ||
            (phase !== "idle" && phase !== "fulfilled" && phase !== "error")
          }
          onClick={onTrigger}
        >
          {phase === "idle"         && (<><CircuitBoard className="h-4 w-4" /> Trigger AI Rebalance</>)}
          {phase === "broadcasting" && (<><Loader2 className="h-4 w-4 animate-spin" /> Broadcasting request…</>)}
          {phase === "thinking"     && (<><Loader2 className="h-4 w-4 animate-spin" /> Reading oracles + asking Groq…</>)}
          {phase === "fulfilling"   && (<><Loader2 className="h-4 w-4 animate-spin" /> Submitting encrypted weights on-chain…</>)}
          {phase === "fulfilled"    && (<><Sparkles className="h-4 w-4" /> Done — trigger again</>)}
          {phase === "error"        && (<><CircuitBoard className="h-4 w-4" /> Retry rebalance</>)}
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
            {phase === "thinking"     && "Agent is pulling live Chainlink prices and calling Groq llama-3.3-70b for an allocation."}
            {phase === "fulfilling"   && "Allocation received. Building encrypted weight handles and submitting fulfilRebalance()."}
            {phase === "fulfilled"    && (<>New portfolio commitment <span className="font-mono text-emerald-glow">{shortHash(result?.portfolioRoot)}</span> — weights remain encrypted on-chain.</>)}
            {phase === "error"        && (<span className="text-amber-300">{errorMsg}</span>)}
          </p>
        </div>

        {/* AI plan summary — always rendered while we have a result, so the
            last triggered strategy stays visible across page refreshes and
            even when no wallet is connected. */}
        {result && (
          <div className="space-y-2 rounded-lg border border-emerald-glow/30 bg-emerald-glow/5 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-emerald-glow">
                AI decision
              </span>
              <span className="font-mono text-emerald-glow">
                {(result.plan.expectedApyBps / 100).toFixed(2)}% expected APY
              </span>
            </div>
            <p className="italic text-zinc-300">&ldquo;{result.plan.reason}&rdquo;</p>
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {result.plan.allocations.map((a) => (
                <div
                  key={a.strategy}
                  className="flex items-center justify-between rounded bg-zinc-950/60 px-2 py-1"
                >
                  <span className="text-zinc-400">
                    {STRATEGY_LABELS[a.strategy] ?? a.strategy}
                  </span>
                  <span className="font-mono text-zinc-100">
                    {(a.weightBps / 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 text-xs">
          {requestTx && (
            <a
              href={txUrl(requestTx)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-100"
            >
              request tx <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {fulfilTx && (
            <a
              href={txUrl(fulfilTx)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-emerald-glow hover:underline"
            >
              fulfil tx <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
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
    case "fulfilling":   return `${base} bg-emerald-glow animate-glow`;
    case "fulfilled":    return `${base} bg-emerald-glow`;
    case "error":        return `${base} bg-rose-400`;
  }
}
