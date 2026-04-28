/* eslint-disable no-console */
/**
 * Confidential AI Yield Fortress — manual interaction script.
 *
 * Quick smoke test against a deployed vault:
 *   • mint encrypted asset to a test user
 *   • deposit
 *   • read encrypted portfolio handles
 *   • request a rebalance
 *
 *   pnpm hardhat run scripts/interact.js --network arbitrumSepolia
 */

const hre  = require("hardhat");
const fs   = require("fs");
const path = require("path");

const { ethers } = hre;

function buildEncryptedAmount(plainAmount, caller) {
  // For the local FHE-mock: a "ciphertext handle" is a fresh keccak.
  const handle = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "address", "uint256"],
      [plainAmount, caller, Date.now()]
    )
  );
  // Caller-bound proof prefix expected by ERC7984Token._verifyProof.
  const proof = ethers.solidityPacked(
    ["bytes32"],
    [ethers.keccak256(ethers.solidityPacked(["address", "bytes32"], [caller, handle]))]
  );
  return { handle, proof };
}

async function main() {
  const network = await ethers.provider.getNetwork();
  const file    = path.join(__dirname, "..", "deployments", `${network.name}-${network.chainId}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`No deployment manifest at ${file} — run deploy.js first.`);
  }
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  const [user]   = await ethers.getSigners();

  const asset = await ethers.getContractAt("ERC7984Token",          manifest.contracts.ConfidentialAsset);
  const vault = await ethers.getContractAt("ConfidentialYieldVault", manifest.contracts.ConfidentialYieldVault);

  console.log("User  :", user.address);
  console.log("Vault :", await vault.getAddress());

  // 1) seed encrypted balance for the user (deployer is the minter wiring path —
  //    in BUILD 1 we mint via the vault role, so use the vault address as msg.sender
  //    for a real run you would do this from a TEE-attested mint job).

  // 2) deposit
  const { handle, proof } = buildEncryptedAmount(1_000_000_000n, user.address); // 1,000.000000 cUSD
  console.log("Encrypted deposit handle:", handle);

  const tx = await asset.confidentialApprove(await vault.getAddress(), handle, proof);
  await tx.wait();
  console.log("approve tx :", tx.hash);

  const tx2 = await vault.deposit(handle, proof);
  await tx2.wait();
  console.log("deposit tx :", tx2.hash);

  // 3) read encrypted portfolio
  const [ids, weights] = await vault.getEncryptedPortfolio();
  console.log("\nEncrypted portfolio:");
  for (let i = 0; i < ids.length; i++) {
    console.log(`  ${ids[i]}  →  weight handle = ${weights[i]}`);
  }
  console.log("Encrypted total assets handle:", await vault.encryptedTotalAssets());

  // 4) request rebalance
  const reb = await vault.requestRebalance();
  const rcpt = await reb.wait();
  console.log("\nRebalance requested in tx:", reb.hash, " (block", rcpt.blockNumber, ")");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
