/**
 * Chainlink price feeds on Arbitrum Sepolia.
 *
 * Sources (official Chainlink Data Feeds):
 *   https://data.chain.link/feeds/arbitrum/sepolia
 *
 * We only use AggregatorV3Interface so the same code works for any feed.
 */

import type { Address } from "viem";

export const aggregatorV3Abi = [
  {
    type: "function",
    stateMutability: "view",
    name: "decimals",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "description",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "latestRoundData",
    inputs: [],
    outputs: [
      { name: "roundId",         type: "uint80"  },
      { name: "answer",          type: "int256"  },
      { name: "startedAt",       type: "uint256" },
      { name: "updatedAt",       type: "uint256" },
      { name: "answeredInRound", type: "uint80"  },
    ],
  },
] as const;

export interface FeedSpec {
  pair: string;
  address: Address;
}

/**
 * Verified Arbitrum Sepolia (chainId 421614) Chainlink feeds.
 */
export const ARB_SEPOLIA_FEEDS: FeedSpec[] = [
  { pair: "ETH/USD",  address: "0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165" },
  { pair: "BTC/USD",  address: "0x56a43EB56Da12C0dc1D972ACb089c06a5dEF8e69" },
  { pair: "USDC/USD", address: "0x0153002d20B96532C639313c2d54c3dA09109309" },
];

export interface PriceQuote {
  pair: string;
  feed: Address;
  /** Plain decimal price, e.g. 3215.42 */
  price: number;
  /** Raw int256 from the aggregator. */
  rawAnswer: string;
  /** Aggregator decimals (typically 8). */
  decimals: number;
  /** Unix seconds. */
  updatedAt: number;
  /** Seconds since updatedAt. */
  ageSeconds: number;
}
