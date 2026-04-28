/* eslint-disable no-console */
const { expect }  = require("chai");
const { ethers }  = require("hardhat");

/**
 * Helpers — model the FHE input ciphertext + caller-bound input proof.
 */
function encryptedFor(caller, plain) {
  const handle = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "address", "uint256"],
      [plain, caller, Math.floor(Math.random() * 2 ** 32)]
    )
  );
  const proof = ethers.solidityPacked(
    ["bytes32"],
    [ethers.keccak256(ethers.solidityPacked(["address", "bytes32"], [caller, handle]))]
  );
  return { handle, proof };
}

/**
 * Mock oracle producing live-feeling yields (bps). Used in rebalance tests
 * to simulate the data the TEE worker would feed to the ElizaOS optimiser.
 */
function mockYieldFeed(seed) {
  const r = (k) => ((seed * 9301 + k * 49297) % 233280) / 233280;
  return {
    US_TBILL_3M:                Math.round(450 + r(1) * 80),    //  4.50–5.30 %
    INVESTMENT_GRADE_CORP_BOND: Math.round(560 + r(2) * 90),    //  5.60–6.50 %
    PRIVATE_CREDIT_DIRECT:      Math.round(680 + r(3) * 120),   //  6.80–8.00 %
    TOKENISED_MMF:              Math.round(470 + r(4) * 60),    //  4.70–5.30 %
  };
}

describe("Confidential AI Yield Fortress", function () {
  let asset, share, vault;
  let governor, alice, bob, agent;

  beforeEach(async () => {
    [governor, alice, bob, agent] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("ERC7984Token");
    asset = await Token.deploy("Confidential USD", "cUSD");
    share = await Token.deploy("Confidential Yield Fortress Share", "cFORT");

    const Vault = await ethers.getContractFactory("ConfidentialYieldVault");
    vault = await Vault.deploy(await asset.getAddress(), await share.getAddress());

    await asset.setMinter(await vault.getAddress());
    await share.setMinter(await vault.getAddress());
    await vault.setAiAgent(agent.address);
  });

  // ---------------------------------------------------------------------------
  describe("ERC-7984 confidentiality", () => {
    it("does NOT expose a plaintext balanceOf", async () => {
      const iface = asset.interface;
      const selectors = iface.fragments
        .filter((f) => f.type === "function")
        .map((f) => f.name);
      expect(selectors).to.not.include("balanceOf");
      expect(selectors).to.include("confidentialBalanceOf");
    });

    it("emits ConfidentialTransfer WITHOUT amount in topics or data", async () => {
      // mint to alice via the vault path (deposit auto-mints share, so we
      // exercise direct transfer instead).
      const { handle, proof } = encryptedFor(alice.address, 100n);
      await expect(
        asset.connect(alice).confidentialTransfer(bob.address, handle, proof)
      ).to.emit(asset, "ConfidentialTransfer").withArgs(alice.address, bob.address);

      const filter = asset.filters.ConfidentialTransfer();
      const events = await asset.queryFilter(filter);
      const ev = events[events.length - 1];
      // Only `from`/`to` are indexed; data must NOT contain the amount.
      expect(ev.data).to.equal("0x");
    });

    it("stores only ciphertext handles for balances", async () => {
      const { handle, proof } = encryptedFor(alice.address, 12345n);
      await asset.connect(alice).confidentialTransfer(bob.address, handle, proof);

      const aliceHandle = await asset.confidentialBalanceOf(alice.address);
      const bobHandle   = await asset.confidentialBalanceOf(bob.address);

      // Each handle is a 32-byte opaque value; neither equals the plaintext.
      expect(aliceHandle).to.match(/^0x[0-9a-f]{64}$/);
      expect(bobHandle).to.match(/^0x[0-9a-f]{64}$/);
      expect(aliceHandle).to.not.equal(ethers.zeroPadValue("0x3039", 32)); // 12345
      expect(bobHandle).to.not.equal(aliceHandle);
    });

    it("rejects an input proof not bound to the caller", async () => {
      const { handle } = encryptedFor(bob.address, 1n);
      const wrongProof = ethers.solidityPacked(
        ["bytes32"],
        [ethers.keccak256(ethers.solidityPacked(["address", "bytes32"], [bob.address, handle]))]
      );
      await expect(
        asset.connect(alice).confidentialTransfer(bob.address, handle, wrongProof)
      ).to.be.revertedWithCustomError(asset, "InvalidProof");
    });
  });

  // ---------------------------------------------------------------------------
  describe("Vault deposit / withdraw", () => {
    it("deposits without revealing the amount, mints encrypted shares", async () => {
      const { handle, proof } = encryptedFor(alice.address, 500_000_000n);
      // alice approves the vault…
      await asset.connect(alice).confidentialApprove(await vault.getAddress(), handle, proof);

      await expect(vault.connect(alice).deposit(handle, proof))
        .to.emit(vault, "Deposited").withArgs(alice.address);

      const shareHandle = await share.confidentialBalanceOf(alice.address);
      expect(shareHandle).to.not.equal(ethers.ZeroHash);
    });

    it("withdraws by burning the encrypted share handle", async () => {
      const { handle, proof } = encryptedFor(alice.address, 1n);
      await asset.connect(alice).confidentialApprove(await vault.getAddress(), handle, proof);
      await vault.connect(alice).deposit(handle, proof);

      const w = encryptedFor(alice.address, 1n);
      await expect(vault.connect(alice).withdraw(w.handle, w.proof))
        .to.emit(vault, "Withdrawn").withArgs(alice.address);
    });
  });

  // ---------------------------------------------------------------------------
  describe("Encrypted portfolio + AI rebalance loop", () => {
    it("getEncryptedPortfolio returns ciphertext handles for every strategy", async () => {
      const [ids, weights] = await vault.getEncryptedPortfolio();
      expect(ids.length).to.equal(4);
      expect(weights.length).to.equal(4);
      for (const w of weights) {
        expect(w).to.match(/^0x[0-9a-f]{64}$/);
        expect(w).to.not.equal(ethers.ZeroHash);
      }
    });

    it("requestRebalance enforces a cool-down", async () => {
      await vault.requestRebalance();
      await expect(vault.requestRebalance()).to.be.revertedWithCustomError(
        vault, "CooldownActive"
      );
    });

    it("only the AI agent can fulfil a rebalance, and weights stay encrypted", async () => {
      const id = 1;
      await vault.requestRebalance();

      const yields = mockYieldFeed(7);
      // Build encrypted weights (the TEE would do this with FHE under the hood).
      const ids = [
        await vault.STRAT_TBILL(),
        await vault.STRAT_IG_BOND(),
        await vault.STRAT_PRIVATE_CREDIT(),
        await vault.STRAT_TOKENISED_MMF(),
      ];
      const weights = ids.map((sId, i) =>
        ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["bytes32", "uint256", "uint256"],
            [sId, Object.values(yields)[i], id]
          )
        )
      );
      const root = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(["bytes32[]"], [weights])
      );

      // non-agent cannot fulfil
      await expect(
        vault.connect(alice).fulfilRebalance(id, ids, weights, root)
      ).to.be.revertedWithCustomError(vault, "NotAiAgent");

      // agent fulfils
      await expect(vault.connect(agent).fulfilRebalance(id, ids, weights, root))
        .to.emit(vault, "RebalanceFulfilled").withArgs(id, root);

      const [, newWeights] = await vault.getEncryptedPortfolio();
      // weights changed — and are still ciphertext.
      for (const w of newWeights) {
        expect(w).to.match(/^0x[0-9a-f]{64}$/);
      }
    });

    it("simulates a live oracle feed across 3 epochs without revealing balances", async () => {
      for (let epoch = 1; epoch <= 3; epoch++) {
        await ethers.provider.send("evm_increaseTime", [3600]);
        await ethers.provider.send("evm_mine", []);

        await vault.requestRebalance();
        const id = await vault.pendingRebalanceId();
        const feed = mockYieldFeed(epoch * 17);
        const ids = [
          await vault.STRAT_TBILL(),
          await vault.STRAT_IG_BOND(),
          await vault.STRAT_PRIVATE_CREDIT(),
          await vault.STRAT_TOKENISED_MMF(),
        ];
        const weights = ids.map((sId, i) =>
          ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
              ["bytes32", "uint256", "uint256"],
              [sId, Object.values(feed)[i], epoch]
            )
          )
        );
        const root = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(["bytes32[]"], [weights])
        );

        await vault.connect(agent).fulfilRebalance(id, ids, weights, root);
        const [, w] = await vault.getEncryptedPortfolio();
        // sanity: handles are 32-byte opaque values
        for (const h of w) expect(h).to.match(/^0x[0-9a-f]{64}$/);
      }
    });
  });
});
