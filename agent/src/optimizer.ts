/**
 * Yield Fortress Optimizer — pure decision logic.
 *
 * In production this is replaced by an ElizaOS runtime invocation (the LLM
 * runs *inside* the TDX enclave, so secrets and portfolio handles never
 * leave). For BUILD 1 we ship a deterministic optimiser that obeys the same
 * caps and produces the same JSON schema documented in `character.json` →
 * `style.post`. This guarantees the contract integration works end-to-end
 * even when the LLM provider key is absent.
 */

export type StrategyId =
  | "US_TBILL_3M"
  | "INVESTMENT_GRADE_CORP_BOND"
  | "PRIVATE_CREDIT_DIRECT"
  | "TOKENISED_MMF";

export type YieldFeed = Record<StrategyId, number>;

export interface OptimizerCaps {
  maxPerStrategyBps: number;
  minDeltaBps: number;
  minTbillFloorBps: number;
}

export interface Allocation {
  strategy: StrategyId;
  weightBps: number;
}

export type RebalanceDecision =
  | {
      action: "rebalance";
      epoch: number;
      allocations: Allocation[];
      expectedApyBps: number;
      reason: string;
    }
  | { action: "hold"; epoch: number; reason: string };

export interface OptimizerInput {
  epoch: number;
  yields: YieldFeed;
  caps: OptimizerCaps;
  previousExpectedApyBps?: number;
}

const TOTAL_BPS = 10_000;

/**
 * Risk-adjusted institutional optimiser:
 *   • soft floor on T-Bills for liquidity (`minTbillFloorBps`)
 *   • hard cap on any single strategy (`maxPerStrategyBps`)
 *   • allocation weight ∝ excess yield over floor, then normalised
 */
export async function runOptimizer(input: OptimizerInput): Promise<RebalanceDecision> {
  const { epoch, yields, caps, previousExpectedApyBps } = input;
  const ids = Object.keys(yields) as StrategyId[];

  const floor = Math.min(...Object.values(yields));
  const excess = ids.map((id) => Math.max(0, yields[id] - floor));
  const excessSum = excess.reduce((a, b) => a + b, 0) || 1;

  // Step 1 — proportional allocation on excess yield.
  let raw = excess.map((e) => Math.round((e / excessSum) * TOTAL_BPS));

  // Step 2 — enforce T-Bill liquidity floor.
  const tBillIdx = ids.indexOf("US_TBILL_3M");
  if (raw[tBillIdx] < caps.minTbillFloorBps) {
    const deficit = caps.minTbillFloorBps - raw[tBillIdx];
    raw[tBillIdx] = caps.minTbillFloorBps;
    // pull pro-rata from the others
    const others = raw.map((w, i) => (i === tBillIdx ? 0 : w));
    const otherSum = others.reduce((a, b) => a + b, 0) || 1;
    raw = raw.map((w, i) =>
      i === tBillIdx ? w : Math.max(0, w - Math.round((others[i] / otherSum) * deficit))
    );
  }

  // Step 3 — enforce per-strategy cap.
  raw = raw.map((w) => Math.min(w, caps.maxPerStrategyBps));

  // Step 4 — re-normalise to exactly 10_000 bps.
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum !== TOTAL_BPS) {
    const drift = TOTAL_BPS - sum;
    raw[tBillIdx] += drift;
  }

  const allocations: Allocation[] = ids.map((id, i) => ({ strategy: id, weightBps: raw[i] }));
  const expectedApyBps = Math.round(
    allocations.reduce((acc, a) => acc + (a.weightBps * yields[a.strategy]) / TOTAL_BPS, 0)
  );

  // Step 5 — cool-down on tiny moves.
  if (
    previousExpectedApyBps !== undefined &&
    Math.abs(expectedApyBps - previousExpectedApyBps) < caps.minDeltaBps
  ) {
    return {
      action: "hold",
      epoch,
      reason: `Yield delta < ${caps.minDeltaBps}bps — not enough to justify rebalance slippage.`,
    };
  }

  return {
    action: "rebalance",
    epoch,
    allocations,
    expectedApyBps,
    reason: `Allocated proportionally on excess yield (floor=${floor}bps), with T-Bill floor of ${caps.minTbillFloorBps}bps and ${caps.maxPerStrategyBps}bps per-strategy cap.`,
  };
}
