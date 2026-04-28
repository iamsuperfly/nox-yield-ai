/* eslint-disable no-console */
/**
 * Yield Fortress Optimizer — TEE entry point.
 *
 * Lifecycle inside an iExec Nox TDX worker:
 *   1. iExec mounts ./iexec_in (read-only) and ./iexec_out (writable)
 *   2. We load `character.json` (the Yield Fortress Optimizer persona)
 *   3. We pull the encrypted portfolio handle + live yield oracle data
 *   4. We invoke the ElizaOS runtime (LLM call happens *inside* the enclave)
 *   5. We validate the JSON allocation, sign it, and write
 *      `/iexec_out/computed.json` + `/iexec_out/result` for the workerpool
 *
 * In BUILD 2 step (5) is replaced by a TDX-attested call to
 * `ConfidentialYieldVault.fulfilRebalance(...)`.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import "dotenv/config";

import character from "../iexec_in/character.json" with { type: "json" };
import { runOptimizer, type YieldFeed } from "./optimizer.js";

const IEXEC_IN  = process.env.IEXEC_IN  ?? path.join(process.cwd(), "iexec_in");
const IEXEC_OUT = process.env.IEXEC_OUT ?? path.join(process.cwd(), "iexec_out");

const FeedSchema = z.object({
  epoch: z.number().int().nonnegative(),
  encryptedPortfolioHandle: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  liveYieldsBps: z.object({
    US_TBILL_3M:                z.number().int(),
    INVESTMENT_GRADE_CORP_BOND: z.number().int(),
    PRIVATE_CREDIT_DIRECT:      z.number().int(),
    TOKENISED_MMF:              z.number().int(),
  }),
});

async function loadFeed(): Promise<z.infer<typeof FeedSchema>> {
  const file = path.join(IEXEC_IN, "feed.json");
  if (fs.existsSync(file)) {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return FeedSchema.parse(raw);
  }
  // Fallback for local `pnpm run dev` without a real iExec mount.
  console.warn("[agent] no feed.json found at", file, "— using mock feed.");
  return {
    epoch: 1,
    encryptedPortfolioHandle:
      "0x" + "ab".repeat(32),
    liveYieldsBps: character.settings.mockYieldUniverse as YieldFeed,
  };
}

function ensureOutDir() {
  fs.mkdirSync(IEXEC_OUT, { recursive: true });
}

async function main() {
  console.log("------------------------------------------------------------");
  console.log(" Yield Fortress Optimizer — booting inside enclave");
  console.log(" character :", character.name);
  console.log(" model     :", `${character.modelProvider}:${character.modelName}`);
  console.log(" tee       :", character.tee?.framework, "(verifyModel=", character.tee?.verifyModel, ")");
  console.log("------------------------------------------------------------");

  const feed = await loadFeed();
  console.log("[agent] epoch", feed.epoch, "live yields bps:", feed.liveYieldsBps);

  const decision = await runOptimizer({
    epoch: feed.epoch,
    yields: feed.liveYieldsBps,
    caps: character.settings.rebalanceCaps,
  });

  ensureOutDir();
  // 1. machine-readable allocation for the workerpool / vault
  fs.writeFileSync(
    path.join(IEXEC_OUT, "computed.json"),
    JSON.stringify(decision, null, 2)
  );

  // 2. iExec spec requires a `result` blob in iexec_out
  fs.writeFileSync(
    path.join(IEXEC_OUT, "result"),
    JSON.stringify({
      character: character.name,
      epoch: feed.epoch,
      decision,
      attestedAt: new Date().toISOString(),
    }, null, 2)
  );

  console.log("[agent] decision written to", path.join(IEXEC_OUT, "computed.json"));
  console.log(JSON.stringify(decision, null, 2));
}

main().catch((err) => {
  console.error("[agent] fatal:", err);
  process.exit(1);
});
