# Yield Fortress — Frontend

Next.js 15 (App Router) dashboard for the [Confidential AI Yield Fortress](../README.md) vault.

- **Wallet**: RainbowKit + wagmi v2 + viem
- **Chain**: Arbitrum Sepolia (chainId `421614`)
- **Styling**: Tailwind CSS v3 + shadcn/ui-style components
- **Theme**: Dark, fully responsive

## Run locally

```bash
cd frontend
cp .env.example .env.local
# fill in the addresses printed by `pnpm run deploy:arbsepolia` and a
# WalletConnect Project ID from https://cloud.walletconnect.com
pnpm install
pnpm run dev
# → http://localhost:3000
```

## Environment variables

| Var | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_CHAIN_ID` | yes | `421614` for Arbitrum Sepolia |
| `NEXT_PUBLIC_RPC_URL` | yes | Public RPC works; Alchemy/Infura recommended |
| `NEXT_PUBLIC_VAULT_ADDRESS` | yes | From `deployments/arbitrumSepolia-421614.json` |
| `NEXT_PUBLIC_ASSET_TOKEN_ADDRESS` | yes | cUSD address |
| `NEXT_PUBLIC_SHARE_TOKEN_ADDRESS` | yes | cFORT address |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | yes | Free at <https://cloud.walletconnect.com> |
| `NEXT_PUBLIC_APP_NAME` | no | Display name |

## What's on the dashboard

- **Confidential Balance** — your cFORT share handle with a 🔒 badge. Plaintext requires a TEE re-encryption permit (BUILD 2).
- **Deposit / Withdraw** — encrypts amounts client-side as ERC-7984 ciphertext + caller-bound input proof, then calls `vault.deposit(...)` or `vault.withdraw(...)`.
- **Strategy Universe** — mock yields (T-Bills 4.80 %, MMF 5.00 %, IG Bonds 5.90 %, Private Credit 7.20 %). Will be replaced by Chainlink Functions in BUILD 2.
- **Request AI Rebalance** — calls `vault.requestRebalance()`. After confirmation the UI shows *"AI Agent is optimizing in TEE…"* and watches for the `RebalanceFulfilled` event with the new portfolio commitment root.
- **Encrypted Portfolio** — strategy slots (public) with their ciphertext weight handles (private).

## Build for production

```bash
pnpm run build
pnpm run start
```
