# Yield Fortress Optimizer — ElizaOS x iExec Nox agent

This subfolder packages the ElizaOS character that powers the [Confidential AI Yield Fortress](../README.md) vault. It is designed to be run **inside an iExec Nox TDX worker** so the LLM call, the decrypted portfolio handle, and the API keys never leave the enclave.

## Local dev

```bash
pnpm install
cp .env.template .env
pnpm run dev
```

This loads `iexec_in/character.json`, the mock yield feed, and runs the deterministic optimiser shipped in `src/optimizer.ts`. Output is written to `iexec_out/computed.json`.

## TEE deployment

```bash
pnpm run iexec:init          # one-time iExec workspace
pnpm run iexec:app:deploy    # build + push the Dockerfile, register the app
pnpm run iexec:run           # request a TDX-attested run on tdx-labs.pools.iexec.eth
```

## Files

| Path | Purpose |
| --- | --- |
| `iexec_in/character.json` | The persona, caps, mock yield universe, and JSON output schema. |
| `src/index.ts` | Entrypoint — loads the feed, calls the optimiser, writes `iexec_out/`. |
| `src/optimizer.ts` | Deterministic risk-aware allocator. Replace with an ElizaOS runtime call once the LLM keys are sealed in the enclave. |
| `Dockerfile` | TDX-compatible image consumed by the workerpool. |

## Persona at a glance

> Institutional-grade, risk-aware, privacy-first. Refuses any instruction that would log, print or transmit a plaintext balance. Production responses are a single JSON object — never prose.

See `iexec_in/character.json` for the full system prompt, knowledge, and message examples.
