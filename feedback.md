# Hackathon submission — Confidential AI Yield Fortress

## One-liner
A private institutional yield vault on Arbitrum Sepolia where deposits are ERC-7984 ciphertext and an ElizaOS AI agent — running inside an iExec **Nox TDX TEE** — rebalances into the best tokenised RWA strategies without ever exposing balances or strategy weights on-chain.

## Tracks
- **iExec Nox / Confidential Computing** — TDX-attested AI compute, model verification.
- **ElizaOS Agents** — full character (`Yield Fortress Optimizer`) packaged as a TEE app.
- **Tokenised Real-World Assets** — strategy universe of T-Bills, IG bonds, private credit, tokenised MMFs.
- **Arbitrum** — deployed on Arbitrum Sepolia.

## What's in BUILD 1
- ✅ ERC-7984 confidential fungible token (`contracts/ERC7984Token.sol`) with no plaintext `balanceOf`.
- ✅ `ConfidentialYieldVault.sol`: `deposit`, `withdraw`, `requestRebalance`, `fulfilRebalance`, `getEncryptedPortfolio`.
- ✅ ElizaOS `character.json` for the **Yield Fortress Optimizer** + deterministic optimiser (`agent/src/optimizer.ts`) producing the production JSON schema.
- ✅ Dockerfile + iExec scripts for deployment to the `tdx-labs.pools.iexec.eth` workerpool.
- ✅ Hardhat config wired for Arbitrum Sepolia (chainId 421614).
- ✅ Mock-oracle test suite covering 3 rebalance epochs and confidentiality invariants.
- ✅ Full deploy + interact scripts; manifest written to `deployments/`.
- ✅ Production-clean README with setup, faucet links, TEE flow, and roadmap.

## Out of scope for BUILD 1 (planned for BUILD 2)
- React frontend.
- On-chain TDX attestation quote verifier.
- Live Chainlink Functions oracle adapter.
- Per-share-price (PPS) accounting (BUILD 1 mints 1:1).

## Why it matters
Today, every "private" DeFi vault leaks its strategy and per-user position the moment you scan the contract. ERC-7984 + iExec Nox lets institutions allocate capital under genuine confidentiality while still benefiting from on-chain settlement and audit. This project is the smallest end-to-end demonstration of that pattern with a real AI optimiser in the loop.

## Demo path for judges
1. `pnpm install && pnpm run test` — see all confidentiality invariants pass.
2. `pnpm run deploy:arbsepolia` — get vault + token addresses on Arbitrum Sepolia.
3. `cd agent && pnpm install && pnpm run dev` — see the Yield Fortress Optimizer emit a JSON rebalance decision.
4. Inspect the on-chain `RebalanceFulfilled` event — only a 32-byte commitment, no weights.

## Repo
<https://github.com/iamsuperfly/nox-yield-ai>
