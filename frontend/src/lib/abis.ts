/**
 * Minimal ABIs for the deployed contracts. Only the entry points the
 * frontend actually calls are included so the bundle stays small.
 */

export const erc7984Abi = [
  {
    type: "function",
    stateMutability: "view",
    name: "name",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "symbol",
    inputs: [],
    outputs: [{ type: "string" }],
  },
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
    name: "confidentialBalanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "confidentialTotalSupply",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    stateMutability: "nonpayable",
    name: "confidentialApprove",
    inputs: [
      { name: "spender", type: "address" },
      { name: "encryptedAmount", type: "bytes32" },
      { name: "inputProof", type: "bytes" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    stateMutability: "nonpayable",
    name: "confidentialTransfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "encryptedAmount", type: "bytes32" },
      { name: "inputProof", type: "bytes" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

export const vaultAbi = [
  {
    type: "function",
    stateMutability: "view",
    name: "asset",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "shareToken",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "encryptedTotalAssets",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "getEncryptedPortfolio",
    inputs: [],
    outputs: [
      { name: "ids", type: "bytes32[]" },
      { name: "encryptedWeights", type: "bytes32[]" },
    ],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "lastRebalanceAt",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "pendingRebalanceId",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "completedRebalanceId",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    stateMutability: "nonpayable",
    name: "deposit",
    inputs: [
      { name: "encryptedAmount", type: "bytes32" },
      { name: "inputProof", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    stateMutability: "nonpayable",
    name: "withdraw",
    inputs: [
      { name: "encryptedShareAmount", type: "bytes32" },
      { name: "inputProof", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    stateMutability: "nonpayable",
    name: "requestRebalance",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "Deposited",
    inputs: [{ name: "user", type: "address", indexed: true }],
    anonymous: false,
  },
  {
    type: "event",
    name: "Withdrawn",
    inputs: [{ name: "user", type: "address", indexed: true }],
    anonymous: false,
  },
  {
    type: "event",
    name: "RebalanceRequested",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "by", type: "address", indexed: true },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RebalanceFulfilled",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "newPortfolioHandle", type: "bytes32", indexed: false },
    ],
    anonymous: false,
  },
] as const;
