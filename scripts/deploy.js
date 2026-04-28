/* eslint-disable no-console */
/**
 * Confidential AI Yield Fortress — deployment script.
 *
 * Compiles, deploys, wires:
 *   1. ERC7984Token  (asset)
 *   2. ERC7984Token  (vault share)
 *   3. ConfidentialYieldVault
 *
 * Then prints a deployment manifest you can paste into `.env` and the
 * ElizaOS agent's `iexec_in/character.json`.
 *
 *   pnpm hardhat run scripts/deploy.js --network arbitrumSepolia
 */

const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

async function main() {
  const { ethers } = hre;

  const network = await ethers.provider.getNetwork();
  const [deployer] = await ethers.getSigners();

  console.log("==============================================");
  console.log(" Confidential AI Yield Fortress — deploying");
  console.log("==============================================");
  console.log(" Network   :", network.name, `(chainId=${network.chainId})`);
  console.log(" Deployer  :", deployer.address);
  console.log(" Balance   :", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("----------------------------------------------");

  // --- 1. Asset token ---------------------------------------------------------
  const Token = await ethers.getContractFactory("ERC7984Token");

  console.log(" → Deploying confidential asset token (cUSD-like)...");
  const asset = await Token.deploy("Confidential USD", "cUSD");
  await asset.waitForDeployment();
  const assetAddr = await asset.getAddress();
  console.log("   asset @", assetAddr);

  // --- 2. Share token --------------------------------------------------------
  console.log(" → Deploying confidential vault-share token (cFORT)...");
  const shareToken = await Token.deploy("Confidential Yield Fortress Share", "cFORT");
  await shareToken.waitForDeployment();
  const shareAddr = await shareToken.getAddress();
  console.log("   share @", shareAddr);

  // --- 3. Vault --------------------------------------------------------------
  console.log(" → Deploying ConfidentialYieldVault...");
  const Vault = await ethers.getContractFactory("ConfidentialYieldVault");
  const vault = await Vault.deploy(assetAddr, shareAddr);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("   vault @", vaultAddr);

  // --- 4. Wire minter rights -------------------------------------------------
  console.log(" → Wiring vault as minter on both tokens...");
  let tx = await asset.setMinter(vaultAddr);     await tx.wait();
  tx     = await shareToken.setMinter(vaultAddr); await tx.wait();

  // --- 5. Set placeholder AI agent (deployer for now) ------------------------
  console.log(" → Pointing vault.aiAgent at deployer (placeholder until TEE worker is bound)...");
  tx = await vault.setAiAgent(deployer.address); await tx.wait();

  // --- 6. Persist manifest ---------------------------------------------------
  const manifest = {
    network: network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    contracts: {
      ConfidentialAsset: assetAddr,
      ConfidentialShare: shareAddr,
      ConfidentialYieldVault: vaultAddr,
    },
    rebalanceCooldownSeconds: 3600,
    deployedAt: new Date().toISOString(),
  };

  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${network.name}-${network.chainId}.json`);
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));

  console.log("----------------------------------------------");
  console.log(" Deployment manifest written:", outPath);
  console.log("----------------------------------------------");
  console.log(" Add to your .env:");
  console.log(`   CONFIDENTIAL_TOKEN_ADDRESS=${assetAddr}`);
  console.log(`   CONFIDENTIAL_VAULT_ADDRESS=${vaultAddr}`);
  console.log("==============================================");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
