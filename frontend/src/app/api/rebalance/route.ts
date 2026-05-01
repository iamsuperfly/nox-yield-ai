import { NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  encodePacked,
  http,
  keccak256,
  parseAbi,
  type Address,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import {
  ARB_SEPOLIA_FEEDS,
  aggregatorV3Abi,
  type PriceQuote,
} from "@/lib/chainlink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VAULT_ADDRESS = (
  process.env.NEXT_PUBLIC_VAULT_ADDRESS ||
  "0x0356098AC53C97e8e7F8025fF75c96AD153F161c"
) as Address;

const RPC_URL =
  process.env.AGENT_RPC_URL ||
  process.env.FAUCET_RPC_URL ||
  process.env.NEXT_PUBLIC_RPC_URL ||
  "https://sepolia-rollup.arbitrum.io/rpc";

const STRATEGY_LABELS = [
  "US_TBILL_3M",
  "INVESTMENT_GRADE_CORP_BOND",
  "PRIVATE_CREDIT_DIRECT",
  "TOKENISED_MMF",
] as const;
type StrategyLabel = (typeof STRATEGY_LABELS)[number];

const STRATEGY_IDS: Record<StrategyLabel, `0x${string}`> = {
  US_TBILL_3M:                keccak256(encodePacked(["string"], ["US_TBILL_3M"])),
  INVESTMENT_GRADE_CORP_BOND: keccak256(encodePacked(["string"], ["INVESTMENT_GRADE_CORP_BOND"])),
  PRIVATE_CREDIT_DIRECT:      keccak256(encodePacked(["string"], ["PRIVATE_CREDIT_DIRECT"])),
  TOKENISED_MMF:              keccak256(encodePacked(["string"], ["TOKENISED_MMF"])),
};

const vaultAbi = parseAbi([
  "function pendingRebalanceId() external view returns (uint256)",
  "function completedRebalanceId() external view returns (uint256)",
  "function aiAgent() external view returns (address)",
  "function fulfilRebalance(uint256 id, bytes32[] ids, bytes32[] encryptedWeights, bytes32 newPortfolioRoot) external",
]);

interface Allocation { strategy: StrategyLabel; weightBps: number; }
interface RebalancePlan {
  action: "rebalance";
  reason: string;
  expectedApyBps: number;
  allocations: Allocation[];
  marketCommentary: string;
}

// ---------------------------------------------------------------------------
// 1. Pull Chainlink prices on Arb Sepolia
// ---------------------------------------------------------------------------

async function fetchChainlinkPrices(pub: PublicClient): Promise<PriceQuote[]> {
  const now = Math.floor(Date.now() / 1000);

  const reads = ARB_SEPOLIA_FEEDS.flatMap((f) => [
    { address: f.address, abi: aggregatorV3Abi, functionName: "decimals" as const },
    { address: f.address, abi: aggregatorV3Abi, functionName: "latestRoundData" as const },
  ]);
  const results = await pub.multicall({ contracts: reads, allowFailure: true });

  const out: PriceQuote[] = [];
  for (let i = 0; i < ARB_SEPOLIA_FEEDS.length; i++) {
    const f = ARB_SEPOLIA_FEEDS[i];
    const dec = results[i * 2];
    const round = results[i * 2 + 1];
    if (dec.status !== "success" || round.status !== "success") continue;

    const decimals = Number(dec.result as number);
    const [, answer, , updatedAt] = round.result as readonly [
      bigint, bigint, bigint, bigint, bigint
    ];
    const price = Number(answer) / 10 ** decimals;
    out.push({
      pair: f.pair,
      feed: f.address,
      price,
      rawAnswer: answer.toString(),
      decimals,
      updatedAt: Number(updatedAt),
      ageSeconds: now - Number(updatedAt),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2. Ask Groq for an allocation, given live market context
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are the Yield Fortress Optimizer, an institutional-grade fixed-income portfolio agent running inside an iExec Nox TDX TEE. You receive live Chainlink oracle prices and a yield universe of four tokenised real-world-asset strategies. You output a single JSON object describing a rebalance.

Hard rules:
- Output ONLY valid JSON, nothing else.
- Allocations are in basis points (bps). They MUST sum to exactly 10000.
- Cap any single strategy at 6000 bps (60%).
- Maintain a minimum 2000 bps (20%) floor on US_TBILL_3M for liquidity.
- Strategy ids: ["US_TBILL_3M","INVESTMENT_GRADE_CORP_BOND","PRIVATE_CREDIT_DIRECT","TOKENISED_MMF"].
- Reason should be one sentence citing the live market signal that drove the move.

Schema:
{
  "action": "rebalance",
  "reason": "string",
  "expectedApyBps": number,
  "allocations": [
    { "strategy": "US_TBILL_3M", "weightBps": number },
    { "strategy": "INVESTMENT_GRADE_CORP_BOND", "weightBps": number },
    { "strategy": "PRIVATE_CREDIT_DIRECT", "weightBps": number },
    { "strategy": "TOKENISED_MMF", "weightBps": number }
  ],
  "marketCommentary": "string"
}`;

async function callGroq(prices: PriceQuote[]): Promise<RebalancePlan> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");

  const userPrompt = JSON.stringify({
    chainlinkArbSepolia: prices.map((p) => ({
      pair: p.pair,
      price: Number(p.price.toFixed(4)),
      ageSeconds: p.ageSeconds,
      feed: p.feed,
    })),
    baselineYieldUniverseBps: {
      US_TBILL_3M: 525,
      INVESTMENT_GRADE_CORP_BOND: 590,
      PRIVATE_CREDIT_DIRECT: 1080,
      TOKENISED_MMF: 510,
    },
    instruction:
      "Adjust the allocation given the live oracle signal. If ETH/BTC are notably weak vs. their normal range (~$2.5k / ~$60k), shift weight toward T-Bills + IG Bonds. If risk-on, lean modestly into Private Credit but never above 60%. If USDC peg drifts >25 bps from $1, raise the T-Bill floor.",
  });

  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.MODEL_NAME || "llama-3.3-70b-versatile",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: userPrompt },
      ],
    }),
  });

  if (!r.ok) throw new Error(`Groq HTTP ${r.status}: ${await r.text()}`);
  const data = (await r.json()) as { choices: { message: { content: string } }[] };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Groq returned empty content");

  const parsed = JSON.parse(raw) as RebalancePlan;
  return validateAndNormalize(parsed);
}

function validateAndNormalize(plan: RebalancePlan): RebalancePlan {
  if (plan.action !== "rebalance" || !Array.isArray(plan.allocations)) {
    throw new Error("Invalid plan: missing action or allocations");
  }
  const map = new Map<StrategyLabel, number>();
  for (const a of plan.allocations) {
    if (!STRATEGY_LABELS.includes(a.strategy)) {
      throw new Error(`Invalid strategy: ${a.strategy}`);
    }
    map.set(a.strategy, Math.max(0, Math.min(10_000, Math.round(a.weightBps))));
  }
  for (const s of STRATEGY_LABELS) if (!map.has(s)) map.set(s, 0);

  if ((map.get("US_TBILL_3M") ?? 0) < 2000) map.set("US_TBILL_3M", 2000);
  for (const s of STRATEGY_LABELS) {
    if ((map.get(s) ?? 0) > 6000) map.set(s, 6000);
  }

  let sum = 0;
  for (const v of map.values()) sum += v;
  const drift = 10_000 - sum;
  if (drift !== 0) map.set("US_TBILL_3M", (map.get("US_TBILL_3M") ?? 0) + drift);

  return {
    ...plan,
    allocations: STRATEGY_LABELS.map((s) => ({ strategy: s, weightBps: map.get(s)! })),
  };
}

// ---------------------------------------------------------------------------
// 3. Build encrypted weight handles + fulfil on-chain
// ---------------------------------------------------------------------------

function encryptWeight(weightBps: number, strategyId: `0x${string}`, agent: Address) {
  return keccak256(
    encodePacked(
      ["uint256", "bytes32", "address", "uint256"],
      [BigInt(weightBps), strategyId, agent, BigInt(Date.now())]
    )
  );
}

function portfolioRoot(handles: `0x${string}`[]) {
  // Keccak commitment over the ordered handle vector — matches the contract's
  // off-chain auditability hint (`newPortfolioRoot`).
  let acc = keccak256(encodePacked(["string"], ["nox-yield-portfolio"]));
  for (const h of handles) {
    acc = keccak256(encodePacked(["bytes32", "bytes32"], [acc, h]));
  }
  return acc;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST() {
  try {
    const pk = process.env.AGENT_PRIVATE_KEY || process.env.FAUCET_PRIVATE_KEY;
    if (!pk) {
      return NextResponse.json(
        { ok: false, error: "AGENT_PRIVATE_KEY not configured" },
        { status: 500 }
      );
    }

    const account = privateKeyToAccount(pk as `0x${string}`);
    const transport = http(RPC_URL);
    const pub = createPublicClient({ chain: arbitrumSepolia, transport });
    const wallet = createWalletClient({ account, chain: arbitrumSepolia, transport });

    // 1. confirm there is an outstanding rebalance to fulfil
    const [pendingId, completedId, aiAgent] = await Promise.all([
      pub.readContract({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: "pendingRebalanceId" }),
      pub.readContract({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: "completedRebalanceId" }),
      pub.readContract({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: "aiAgent" }),
    ]);

    if (pendingId <= completedId) {
      return NextResponse.json(
        { ok: false, error: "No pending rebalance — call requestRebalance() first." },
        { status: 409 }
      );
    }
    if ((aiAgent as string).toLowerCase() !== account.address.toLowerCase()) {
      return NextResponse.json(
        { ok: false, error: `Configured AGENT_PRIVATE_KEY (${account.address}) is not the vault aiAgent (${aiAgent}).` },
        { status: 500 }
      );
    }

    // 2. live Chainlink oracle reads (inside the would-be enclave)
    const prices = await fetchChainlinkPrices(pub);
    if (prices.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Could not read any Chainlink price feed" },
        { status: 502 }
      );
    }

    // 3. ElizaOS-style call to Groq with live market context
    const plan = await callGroq(prices);

    // 4. build encrypted weight handles + portfolio root
    const ids:    `0x${string}`[] = plan.allocations.map((a) => STRATEGY_IDS[a.strategy]);
    const weights:`0x${string}`[] = plan.allocations.map((a) =>
      encryptWeight(a.weightBps, STRATEGY_IDS[a.strategy], account.address)
    );
    const root = portfolioRoot(weights);

    // 5. submit on-chain
    const txHash = await wallet.writeContract({
      address: VAULT_ADDRESS,
      abi: vaultAbi,
      functionName: "fulfilRebalance",
      args: [pendingId, ids, weights, root],
    });

    // Don't await receipt — let UI poll for the event.
    pub.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 }).catch(() => {});

    return NextResponse.json({
      ok: true,
      txHash,
      rebalanceId: pendingId.toString(),
      portfolioRoot: root,
      agent: account.address,
      prices,
      plan,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown rebalance error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  // Lightweight oracle ping for the UI — returns just the live Chainlink
  // prices, no LLM call, no signed tx.
  try {
    const transport = http(RPC_URL);
    const pub = createPublicClient({ chain: arbitrumSepolia, transport });
    const prices = await fetchChainlinkPrices(pub);
    return NextResponse.json({ ok: true, prices });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "oracle read failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
