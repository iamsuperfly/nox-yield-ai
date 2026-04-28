/**
 * BUILD 1 mock yield universe. In BUILD 2 these will be replaced by a live
 * Chainlink Functions feed read inside the TDX enclave.
 */
export type StrategyKey =
  | "US_TBILL_3M"
  | "INVESTMENT_GRADE_CORP_BOND"
  | "PRIVATE_CREDIT_DIRECT"
  | "TOKENISED_MMF";

export interface YieldRow {
  key: StrategyKey;
  label: string;
  apyBps: number;
  riskTier: "Low" | "Mid" | "High";
  durationDays: number;
  blurb: string;
}

export const MOCK_YIELDS: YieldRow[] = [
  {
    key: "US_TBILL_3M",
    label: "US T-Bills (3M)",
    apyBps: 480,
    riskTier: "Low",
    durationDays: 90,
    blurb: "Short-duration sovereign paper. The liquidity floor.",
  },
  {
    key: "TOKENISED_MMF",
    label: "Tokenised MMF",
    apyBps: 500,
    riskTier: "Low",
    durationDays: 1,
    blurb: "On-chain money-market fund — daily NAV, instant redemptions.",
  },
  {
    key: "INVESTMENT_GRADE_CORP_BOND",
    label: "IG Corporate Bonds",
    apyBps: 590,
    riskTier: "Mid",
    durationDays: 540,
    blurb: "Investment-grade corporates. Spread over treasuries.",
  },
  {
    key: "PRIVATE_CREDIT_DIRECT",
    label: "Private Credit (Direct)",
    apyBps: 720,
    riskTier: "High",
    durationDays: 1095,
    blurb: "Direct-lending vehicles. Premium for illiquidity & complexity.",
  },
];

export const formatBps = (bps: number) => `${(bps / 100).toFixed(2)}%`;
