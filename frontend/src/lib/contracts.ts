import { type Address, keccak256, encodePacked, toHex } from "viem";

const env = (k: string) => process.env[k] ?? "";

/**
 * Live deployment on Arbitrum Sepolia (chainId 421614).
 * These are the source-of-truth defaults — any NEXT_PUBLIC_* override is
 * applied on top, but the app works out of the box without env vars.
 * See `deployments/arbitrumSepolia-421614.json`.
 */
const DEFAULTS = {
  CHAIN_ID: 421614,
  RPC_URL:  "https://sepolia-rollup.arbitrum.io/rpc",
  VAULT:    "0x2ef85dE8242D490e850855Dc28FbD95bD4F5CEb1",
  ASSET:    "0x85EF3afECFB7e7c021cE974748e2c4f4D99A4c9e",
  SHARE:    "0xebB7a8967C5E18eA37C445Eaa6c5B3Ef6b3119D2",
  APP_NAME: "Nox Yield AI",
} as const;

export const CHAIN_ID = Number(env("NEXT_PUBLIC_CHAIN_ID") || DEFAULTS.CHAIN_ID);
export const RPC_URL  = env("NEXT_PUBLIC_RPC_URL") || DEFAULTS.RPC_URL;

export const VAULT_ADDRESS:       Address = (env("NEXT_PUBLIC_VAULT_ADDRESS")        || DEFAULTS.VAULT) as Address;
export const ASSET_TOKEN_ADDRESS: Address = (env("NEXT_PUBLIC_ASSET_TOKEN_ADDRESS")  || DEFAULTS.ASSET) as Address;
export const SHARE_TOKEN_ADDRESS: Address = (env("NEXT_PUBLIC_SHARE_TOKEN_ADDRESS")  || DEFAULTS.SHARE) as Address;

export const APP_NAME = env("NEXT_PUBLIC_APP_NAME") || DEFAULTS.APP_NAME;

export const isVaultConfigured = (): boolean =>
  VAULT_ADDRESS !== "0x0000000000000000000000000000000000000000";

/**
 * Build a Nox-style ciphertext handle + caller-bound input proof for a
 * plaintext amount. In production the handle would come from the FHE
 * coprocessor / TEE re-encryption; here we model it the same way the
 * Hardhat tests do so the contract accepts it.
 */
export function buildEncryptedAmount(plain: bigint, caller: Address) {
  const handle = keccak256(
    encodePacked(["uint256", "address", "uint256"], [plain, caller, BigInt(Date.now())])
  );
  // ERC7984Token._verifyProof expects the first 32 bytes of `inputProof`
  // to equal keccak256(abi.encodePacked(caller, handle))
  const proof = keccak256(encodePacked(["address", "bytes32"], [caller, handle]));
  return { handle: handle as `0x${string}`, proof: proof as `0x${string}` };
}

export const ARBITRUM_SEPOLIA_EXPLORER = "https://sepolia.arbiscan.io";

export const txUrl  = (hash: string)    => `${ARBITRUM_SEPOLIA_EXPLORER}/tx/${hash}`;
export const addrUrl = (addr: Address)  => `${ARBITRUM_SEPOLIA_EXPLORER}/address/${addr}`;

/** Just for display — not used for any on-chain decisions in BUILD 1. */
export const STRATEGY_LABELS: Record<string, string> = {
  US_TBILL_3M: "US T-Bills (3M)",
  INVESTMENT_GRADE_CORP_BOND: "IG Corporate Bonds",
  PRIVATE_CREDIT_DIRECT: "Private Credit (Direct)",
  TOKENISED_MMF: "Tokenised MMF",
};

export function strategyIdToLabel(id: string): string {
  for (const k of Object.keys(STRATEGY_LABELS)) {
    if (id === toHex(keccak256(toHex(k)))) return STRATEGY_LABELS[k];
  }
  return "Strategy";
}
