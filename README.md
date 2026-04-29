# Confidential AI Yield Fortress

> **Private institutional yield vault on Arbitrum Sepolia.**
> Users deposit confidential ERC-7984 tokens. An autonomous AI agent runs entirely inside an iExec **Nox TDX TEE**, reads the encrypted portfolio + live yield data, and rebalances into the best tokenised real-world-asset strategies (T-Bills, IG bonds, private credit, MMFs) — **without ever exposing balances, positions or strategy weights on-chain.**

**Live demo:** <https://nox-yield-ai.vercel.app>
**Deployed on Arbitrum Sepolia** (addresses in [`deployments/arbitrumSepolia-421614.json`](./deployments/arbitrumSepolia-421614.json))
**Live Chainlink oracles + real TEE AI rebalancing** — clicking *Trigger AI Rebalance* in the demo reads ETH/USD, BTC/USD and USDC/USD from the official Chainlink AggregatorV3 feeds on Arb Sepolia, asks Groq's `llama-3.3-70b-versatile` for an institutional allocation given that live market state, then writes the resulting **encrypted** weights to the vault via `fulfilRebalance()`. Plaintext weights never touch the chain.

| Contract | Address |
| --- | --- |
| ConfidentialYieldVault | [`0x2ef85dE8242D490e850855Dc28FbD95bD4F5CEb1`](https://sepolia.arbiscan.io/address/0x2ef85dE8242D490e850855Dc28FbD95bD4F5CEb1) |
| ConfidentialAsset (cUSD) | [`0x85EF3afECFB7e7c021cE974748e2c4f4D99A4c9e`](https://sepolia.arbiscan.io/address/0x85EF3afECFB7e7c021cE974748e2c4f4D99A4c9e) |
| ConfidentialShare (cFORT) | [`0xebB7a8967C5E18eA37C445Eaa6c5B3Ef6b3119D2`](https://sepolia.arbiscan.io/address/0xebB7a8967C5E18eA37C445Eaa6c5B3Ef6b3119D2) |

---

## ✨ Why this is interesting

- **Balances are encrypted, not just hidden.** All token amounts are ERC-7984 ciphertext handles. There is **no `balanceOf(address) → uint256`** anywhere in the system.
- **The optimiser runs inside a TDX enclave.** Strategy logic, model prompts, and decrypted state never leave the iExec Nox worker.
- **The on-chain surface is minimal and auditable.** Only commitments (`bytes32` handles) and event topics cross the EVM boundary. Anyone can watch the chain and learn nothing.
- **Production-clean.** Hardhat 2.22, Solidity 0.8.27, OpenZeppelin Confidential Contracts, ElizaOS 0.1.x, pnpm workspace.

---

## 🗂 Project layout

```
nox-yield-ai/
├── contracts/
│   ├── ConfidentialYieldVault.sol       # the vault (deposit/withdraw/rebalance)
│   ├── ERC7984Token.sol                 # confidential fungible token
│   └── interfaces/IConfidentialFungibleToken.sol
├── agent/                               # ElizaOS iExec TDX-TEE agent
│   ├── iexec_in/
│   │   └── character.json               # "Yield Fortress Optimizer" persona
│   ├── src/
│   │   ├── index.ts                     # TEE entrypoint
│   │   └── optimizer.ts                 # deterministic risk-aware allocator
│   ├── Dockerfile                       # built and pushed to iExec workerpool
│   ├── .env.template
│   ├── tsconfig.json
│   └── package.json
├── frontend/                            # Next.js 15 dashboard (App Router)
│   ├── src/
│   │   ├── app/                         # layout, providers, page
│   │   ├── components/                  # balance, deposit/withdraw, rebalance, yields…
│   │   └── lib/                         # wagmi, contracts, abis, ciphertext helpers
│   ├── tailwind.config.ts
│   ├── next.config.mjs
│   ├── .env.example
│   └── package.json
├── scripts/
│   ├── deploy.js                        # compiles + deploys vault + tokens
│   └── interact.js                      # smoke-test against a deployed vault
├── test/
│   └── ConfidentialVault.test.js        # confidentiality + rebalance assertions
├── hardhat.config.ts
├── package.json
├── pnpm-workspace.yaml                  # frontend + agent are pnpm workspaces
├── .env.example
├── .gitignore
├── feedback.md
└── README.md
```

---

## 🚀 Quick start (Replit / local)

> Replit gives you Node 24 by default. If you run locally you need Node ≥ 20 and pnpm 9.

```bash
# 1) install deps
pnpm install

# 2) configure env
cp .env.example .env
#   PRIVATE_KEY               — Arbitrum Sepolia funded key
#   ARBITRUM_SEPOLIA_RPC_URL  — public RPC works, Alchemy/Infura is faster
#   ARBISCAN_API_KEY          — optional, for verification

# 3) compile + run unit tests
pnpm run compile
pnpm run test

# 4) deploy to Arbitrum Sepolia
pnpm run deploy:arbsepolia

# 5) (optional) smoke-test the deployment
pnpm run interact:arbsepolia
```

The deploy script writes a manifest to `deployments/arbitrumSepolia-421614.json` and prints the two addresses to paste into your `.env`:

```
CONFIDENTIAL_TOKEN_ADDRESS=0x…
CONFIDENTIAL_VAULT_ADDRESS=0x…
```

---

## 💧 Getting test funds

| What | Where |
| --- | --- |
| Arbitrum Sepolia ETH | <https://faucet.quicknode.com/arbitrum/sepolia> · <https://www.alchemy.com/faucets/arbitrum-sepolia> |
| iExec test RLC | <https://faucet.iex.ec> |
| Arbiscan API key | <https://arbiscan.io/myapikey> |

---

## 🖥 How to run the frontend locally

The dashboard lives in [`./frontend`](./frontend) — Next.js 15 (App Router) +
RainbowKit + wagmi + Tailwind/shadcn.

```bash
cd frontend
cp .env.example .env.local     # paste vault + token addresses + WalletConnect Project ID
pnpm install
pnpm run dev                   # → http://localhost:3000
```

You'll need to populate `.env.local` with:

- `NEXT_PUBLIC_VAULT_ADDRESS`, `NEXT_PUBLIC_ASSET_TOKEN_ADDRESS`,
  `NEXT_PUBLIC_SHARE_TOKEN_ADDRESS` — taken from the JSON written by
  `pnpm run deploy:arbsepolia` (printed at the end of the deploy run).
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — free, 30 seconds at
  <https://cloud.walletconnect.com>.
- `NEXT_PUBLIC_RPC_URL` — defaults to the public Arbitrum Sepolia RPC; an
  Alchemy/Infura URL gives much better latency.

What you get:

- **Confidential Balance** card with a 🔒 (Lock) badge — reads your
  encrypted ERC-7984 share handle from the cFORT token.
- **Deposit / Withdraw** that builds the ciphertext + caller-bound input
  proof client-side and calls the vault.
- **Strategy universe** table with mock yields (T-Bills 4.80 %, IG Bonds
  5.90 %, Private Credit 7.20 %, Tokenised MMF 5.00 %) — replaced by
  Chainlink Functions in BUILD 2.
- **Request AI Rebalance** button — broadcasts `requestRebalance()` and
  shows *"AI Agent is optimizing in TEE…"* until the `RebalanceFulfilled`
  event arrives with the new portfolio commitment root.

You can also run it from the project root:

```bash
pnpm run frontend:install
pnpm run frontend:dev
```

---

## 🤖 How the AI agent runs in the TEE

The agent lives in [`./agent`](./agent) and is packaged as an iExec confidential app.

```bash
cd agent
cp .env.template .env          # fill MODEL_PROVIDER, OPENAI_API_KEY, etc.
pnpm install
pnpm run dev                   # local run with mock yield feed
```

### TEE deployment (Nox TDX)

```bash
cd agent
pnpm run iexec:init            # one-time iExec workspace setup
pnpm run iexec:app:deploy      # builds Dockerfile, registers app on bellecour
pnpm run iexec:run             # runs on the tdx-labs.pools.iexec.eth workerpool
```

### What happens at runtime

1. The iExec workerpool spins up a TDX enclave and mounts:
   - `/iexec_in/character.json`  — the **Yield Fortress Optimizer** persona
   - `/iexec_in/feed.json`       — the live yield oracle snapshot
2. The container loads the encrypted portfolio handle and decrypts it **inside** the enclave (the operator can never see it).
3. ElizaOS runs the optimiser, producing the deterministic JSON below:
   ```json
   {
     "action": "rebalance",
     "epoch": 7,
     "allocations": [
       { "strategy": "US_TBILL_3M",                "weightBps": 2500 },
       { "strategy": "INVESTMENT_GRADE_CORP_BOND", "weightBps": 2500 },
       { "strategy": "PRIVATE_CREDIT_DIRECT",      "weightBps": 3500 },
       { "strategy": "TOKENISED_MMF",              "weightBps": 1500 }
     ],
     "expectedApyBps": 598,
     "reason": "Private credit spread widened 80bps over MMF; cap-bound at 35% per institutional profile."
   }
   ```
4. The TDX worker submits the decision via `ConfidentialYieldVault.fulfilRebalance(...)`. In **BUILD 1** the call is gated on the configured `aiAgent` address; in **BUILD 2** it will additionally verify the TDX attestation quote.

### Persona

The optimiser is **institutional-grade, risk-aware, privacy-first**. It refuses any prompt that would leak balances, enforces per-strategy caps, and preserves a T-Bill liquidity floor.

---

## 🔐 Confidentiality guarantees (what the tests prove)

The test suite ([`test/ConfidentialVault.test.js`](./test/ConfidentialVault.test.js)) asserts:

- ❌ `ERC7984Token` exposes **no** `balanceOf(address) → uint256` selector.
- ✅ Every transfer event emits `from`/`to` only — **no amount in topics or data**.
- ✅ Storage slots for balances are 32-byte ciphertext handles (never the plaintext).
- ✅ The Nox-style input proof is bound to `msg.sender`; mismatched proofs revert.
- ✅ The vault re-emits a `RebalanceFulfilled` event whose only payload is a 32-byte commitment root — no weights leak.
- ✅ Across three simulated rebalance epochs with rotating mock yields (T-Bill 4.5–5.3 %, IG 5.6–6.5 %, private credit 6.8–8.0 %, MMF 4.7–5.3 %), no plaintext ever appears in storage or events.

Run them with:

```bash
pnpm run test
```

---

## 🛣 Roadmap

| Build | Scope |
| --- | --- |
| **Build 1 (this)** | Contracts + ElizaOS persona + TEE entrypoint + tests + deploy scripts |
| Build 2 | TDX attestation quote verification on-chain · Chainlink Functions oracle for live yields · React frontend |
| Build 3 | Multi-vault routing · permit2-style encrypted approvals · Mainnet beta |

---

## 🧾 License

MIT © 2025 Confidential AI Yield Fortress
