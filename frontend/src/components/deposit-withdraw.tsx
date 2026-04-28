"use client";

import * as React from "react";
import {
  useAccount,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { ArrowDownToLine, ArrowUpFromLine, ExternalLink, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { erc7984Abi, vaultAbi } from "@/lib/abis";
import {
  ASSET_TOKEN_ADDRESS,
  VAULT_ADDRESS,
  buildEncryptedAmount,
  isVaultConfigured,
  txUrl,
} from "@/lib/contracts";

type Mode = "deposit" | "withdraw";

export function DepositWithdraw() {
  const { address } = useAccount();
  const [mode, setMode] = React.useState<Mode>("deposit");
  const [amount, setAmount] = React.useState("100");
  const [stage, setStage] = React.useState<"idle" | "approving" | "broadcasting">("idle");

  const { writeContractAsync } = useWriteContract();
  const [lastTx, setLastTx] = React.useState<`0x${string}` | undefined>();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({
    hash: lastTx,
  });

  const disabled = !address || !isVaultConfigured() || stage !== "idle" || confirming;

  async function onSubmit() {
    if (!address) return;
    const plain = BigInt(Math.max(0, Math.floor(Number(amount) * 1e6))); // cUSD has 6 decimals
    if (plain <= 0n) return;

    try {
      if (mode === "deposit") {
        const enc = buildEncryptedAmount(plain, address);
        setStage("approving");
        await writeContractAsync({
          address: ASSET_TOKEN_ADDRESS,
          abi: erc7984Abi,
          functionName: "confidentialApprove",
          args: [VAULT_ADDRESS, enc.handle, enc.proof],
        });
        setStage("broadcasting");
        const tx = await writeContractAsync({
          address: VAULT_ADDRESS,
          abi: vaultAbi,
          functionName: "deposit",
          args: [enc.handle, enc.proof],
        });
        setLastTx(tx);
      } else {
        const enc = buildEncryptedAmount(plain, address);
        setStage("broadcasting");
        const tx = await writeContractAsync({
          address: VAULT_ADDRESS,
          abi: vaultAbi,
          functionName: "withdraw",
          args: [enc.handle, enc.proof],
        });
        setLastTx(tx);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setStage("idle");
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Move funds confidentially</CardTitle>
        <CardDescription>
          Amounts are encrypted client-side as ERC-7984 ciphertext. The vault never
          sees the plaintext.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="deposit" className="gap-1.5">
              <ArrowDownToLine className="h-3.5 w-3.5" />
              Deposit
            </TabsTrigger>
            <TabsTrigger value="withdraw" className="gap-1.5">
              <ArrowUpFromLine className="h-3.5 w-3.5" />
              Withdraw
            </TabsTrigger>
          </TabsList>

          <TabsContent value="deposit" className="space-y-4">
            <AmountField value={amount} onChange={setAmount} suffix="cUSD" />
            <p className="text-xs text-zinc-500">
              Pulls a confidential transfer of cUSD into the vault and mints an
              equal ciphertext of cFORT shares to your address.
            </p>
          </TabsContent>

          <TabsContent value="withdraw" className="space-y-4">
            <AmountField value={amount} onChange={setAmount} suffix="cFORT" />
            <p className="text-xs text-zinc-500">
              Burns the encrypted share handle and pushes back an equal
              ciphertext of cUSD.
            </p>
          </TabsContent>
        </Tabs>

        <Separator />

        <Button
          className="w-full"
          size="lg"
          onClick={onSubmit}
          disabled={disabled}
        >
          {stage === "approving" && <Loader2 className="h-4 w-4 animate-spin" />}
          {stage === "broadcasting" && <Loader2 className="h-4 w-4 animate-spin" />}
          {stage === "idle" && (mode === "deposit" ? "Deposit confidentially" : "Withdraw confidentially")}
          {stage === "approving" && "Approving encrypted allowance…"}
          {stage === "broadcasting" && "Broadcasting…"}
        </Button>

        {!isVaultConfigured() && (
          <p className="text-xs text-amber-300/80">
            Set <code className="text-amber-200">NEXT_PUBLIC_VAULT_ADDRESS</code> and{" "}
            <code className="text-amber-200">NEXT_PUBLIC_ASSET_TOKEN_ADDRESS</code> in{" "}
            <code className="text-amber-200">.env.local</code> after running{" "}
            <code className="text-amber-200">pnpm run deploy:arbsepolia</code>.
          </p>
        )}

        {lastTx && (
          <a
            href={txUrl(lastTx)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-emerald-glow hover:underline"
          >
            {confirming ? "Confirming on Arbitrum Sepolia…" : confirmed ? "Confirmed ↗" : "View tx ↗"}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </CardContent>
    </Card>
  );
}

function AmountField({
  value, onChange, suffix,
}: { value: string; onChange: (v: string) => void; suffix: string }) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        Amount
      </label>
      <div className="relative">
        <Input
          inputMode="decimal"
          pattern="^[0-9]*[.,]?[0-9]*$"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(",", "."))}
          className="pr-16 text-base"
          placeholder="0.00"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-500">
          {suffix}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {["100", "1000", "10000"].map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onChange(q)}
            className="rounded-md border border-zinc-800 px-2.5 py-1 text-xs text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
          >
            {Number(q).toLocaleString()}
          </button>
        ))}
      </div>
    </div>
  );
}
