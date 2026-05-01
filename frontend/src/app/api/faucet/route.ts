import { NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  encodePacked,
  http,
  isAddress,
  keccak256,
  parseAbi,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ASSET_TOKEN = (
  process.env.NEXT_PUBLIC_ASSET_TOKEN_ADDRESS ||
  "0xc7005Ed975F87c2958a5BE84FaB0eDe47799C6c9"
) as Address;

const RPC_URL =
  process.env.FAUCET_RPC_URL ||
  process.env.NEXT_PUBLIC_RPC_URL ||
  "https://sepolia-rollup.arbitrum.io/rpc";

const ALLOWED_AMOUNTS = new Set([1000n, 5000n]);
const MIN_INTERVAL_MS = 30_000;

const lastDripPerAddress = new Map<string, number>();

const abi = parseAbi([
  "function confidentialTransfer(address to, bytes32 encryptedAmount, bytes inputProof) external returns (bool)",
]);

/**
 * Build the (handle, proof) pair the same way `lib/contracts.ts` does — must
 * match `ERC7984Token._verifyProof`, which expects:
 *   first 32 bytes of inputProof == keccak256(abi.encodePacked(caller, handle))
 */
function buildEncrypted(plain: bigint, caller: Address, recipient: Address) {
  const handle = keccak256(
    encodePacked(
      ["uint256", "address", "address", "uint256"],
      [plain, caller, recipient, BigInt(Date.now())]
    )
  );
  const proof = keccak256(encodePacked(["address", "bytes32"], [caller, handle]));
  return { handle, proof };
}

export async function POST(req: Request) {
  try {
    const pk = process.env.FAUCET_PRIVATE_KEY;
    if (!pk) {
      return NextResponse.json(
        { ok: false, error: "Faucet not configured: FAUCET_PRIVATE_KEY missing" },
        { status: 500 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      to?: string;
      amount?: number;
    };

    if (!body.to || !isAddress(body.to)) {
      return NextResponse.json(
        { ok: false, error: "Invalid `to` address" },
        { status: 400 }
      );
    }
    const to = body.to as Address;

    const amount = BigInt(body.amount ?? 1000);
    if (!ALLOWED_AMOUNTS.has(amount)) {
      return NextResponse.json(
        { ok: false, error: "Amount must be 1000 or 5000" },
        { status: 400 }
      );
    }

    const last = lastDripPerAddress.get(to.toLowerCase()) ?? 0;
    const wait = MIN_INTERVAL_MS - (Date.now() - last);
    if (wait > 0) {
      return NextResponse.json(
        { ok: false, error: `Slow down — try again in ${Math.ceil(wait / 1000)}s` },
        { status: 429 }
      );
    }

    const account = privateKeyToAccount(pk as `0x${string}`);
    const transport = http(RPC_URL);
    const wallet = createWalletClient({ account, chain: arbitrumSepolia, transport });
    const pub    = createPublicClient({ chain: arbitrumSepolia, transport });

    // cUSD has 6 decimals — match the deposit/withdraw flow.
    const plain = amount * 1_000_000n;
    const { handle, proof } = buildEncrypted(plain, account.address, to);

    // We use confidentialTransfer (open to any signer) rather than
    // confidentialMint (vault-only). The contract models balances as opaque
    // ciphertext handles, so the on-chain effect — rotating the recipient's
    // encrypted balance handle — is identical to a mint for demo purposes.
    const txHash = await wallet.writeContract({
      address: ASSET_TOKEN,
      abi,
      functionName: "confidentialTransfer",
      args: [to, handle, proof],
    });

    lastDripPerAddress.set(to.toLowerCase(), Date.now());

    pub.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 }).catch(() => {});

    return NextResponse.json({
      ok: true,
      txHash,
      to,
      amount: amount.toString(),
      asset: ASSET_TOKEN,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown faucet error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
