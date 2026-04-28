// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IConfidentialFungibleToken} from "./interfaces/IConfidentialFungibleToken.sol";
import {ERC7984Token} from "./ERC7984Token.sol";

/**
 * @title  ConfidentialYieldVault
 * @author Confidential AI Yield Fortress
 *
 * @notice Private institutional yield vault. Users deposit a confidential
 *         ERC-7984 token; the vault holds an encrypted position book and
 *         delegates rebalancing decisions to an ElizaOS AI agent that runs
 *         entirely inside an iExec Nox TDX TEE.
 *
 *         No balance, position, or strategy weight is ever stored or emitted
 *         in plaintext. Only ciphertext handles cross the EVM boundary.
 *
 * @dev    REBALANCE FLOW
 *         --------------
 *         1. Anyone can call `requestRebalance()` once the cool-down has
 *            elapsed. This emits a `RebalanceRequested` event picked up by
 *            the iExec orderbook.
 *         2. A TDX worker pulls the encrypted portfolio handle, decrypts it
 *            inside the enclave, queries oracle yield data, runs the ElizaOS
 *            "Yield Fortress Optimizer" character, and produces a new
 *            allocation ciphertext + an attestation.
 *         3. The worker submits the result via `fulfilRebalance()` — which
 *            in BUILD 2 will be wired to a TEE attestation verifier.
 *
 *         For BUILD 1 we expose the function but gate it on the configured
 *         `aiAgent` address so the contract is integration-ready.
 */
contract ConfidentialYieldVault {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Minimum interval between two rebalance triggers.
    uint256 public constant REBALANCE_COOLDOWN = 1 hours;

    /// @notice Strategy slot identifiers — the *labels* are public, the
    ///         *weights* are encrypted.
    bytes32 public constant STRAT_TBILL          = keccak256("US_TBILL_3M");
    bytes32 public constant STRAT_IG_BOND        = keccak256("INVESTMENT_GRADE_CORP_BOND");
    bytes32 public constant STRAT_PRIVATE_CREDIT = keccak256("PRIVATE_CREDIT_DIRECT");
    bytes32 public constant STRAT_TOKENISED_MMF  = keccak256("TOKENISED_MMF");

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    ERC7984Token public immutable asset;       // the deposit token
    ERC7984Token public immutable shareToken;  // confidential vault shares
    address      public immutable governor;
    address      public           aiAgent;     // TEE-enclaved ElizaOS agent

    /// @dev Per-strategy encrypted weight handle.
    mapping(bytes32 => bytes32) private _strategyWeight;

    /// @dev List of registered strategy ids (public — only weights are private).
    bytes32[] public strategyIds;

    uint256 public lastRebalanceAt;
    uint256 public pendingRebalanceId;
    uint256 public completedRebalanceId;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event Deposited(address indexed user);                       // amount hidden
    event Withdrawn(address indexed user);                       // amount hidden
    event RebalanceRequested(uint256 indexed id, address indexed by, uint256 timestamp);
    event RebalanceFulfilled(uint256 indexed id, bytes32 newPortfolioHandle);
    event AiAgentUpdated(address indexed previous, address indexed next);
    event StrategyRegistered(bytes32 indexed id);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error NotGovernor();
    error NotAiAgent();
    error CooldownActive();
    error UnknownStrategy();
    error AlreadyFulfilled();

    modifier onlyGovernor() {
        if (msg.sender != governor) revert NotGovernor();
        _;
    }

    modifier onlyAiAgent() {
        if (msg.sender != aiAgent) revert NotAiAgent();
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(ERC7984Token asset_, ERC7984Token shareToken_) {
        require(address(asset_)      != address(0), "vault: asset=0");
        require(address(shareToken_) != address(0), "vault: shares=0");
        asset       = asset_;
        shareToken  = shareToken_;
        governor    = msg.sender;

        _registerStrategy(STRAT_TBILL);
        _registerStrategy(STRAT_IG_BOND);
        _registerStrategy(STRAT_PRIVATE_CREDIT);
        _registerStrategy(STRAT_TOKENISED_MMF);
    }

    // -------------------------------------------------------------------------
    // Governance
    // -------------------------------------------------------------------------

    function setAiAgent(address newAgent) external onlyGovernor {
        emit AiAgentUpdated(aiAgent, newAgent);
        aiAgent = newAgent;
    }

    function registerStrategy(bytes32 id) external onlyGovernor {
        _registerStrategy(id);
    }

    function _registerStrategy(bytes32 id) internal {
        require(id != bytes32(0), "vault: bad strategy id");
        if (_strategyWeight[id] == bytes32(0)) {
            // initial encrypted weight = sentinel non-zero handle so storage
            // never reveals "uninitialised".
            _strategyWeight[id] = keccak256(abi.encode("init", id, address(this)));
            strategyIds.push(id);
            emit StrategyRegistered(id);
        }
    }

    // -------------------------------------------------------------------------
    // User flow — confidential deposit / withdraw
    // -------------------------------------------------------------------------

    /**
     * @notice Deposit confidential `asset` into the vault.
     * @param  encryptedAmount  Ciphertext handle of the amount to deposit.
     * @param  inputProof       Caller-bound proof for the ciphertext.
     *
     * @dev We pull the encrypted amount from the caller and mint an equal
     *      ciphertext handle of share tokens. The vault never learns the
     *      plaintext value of the deposit.
     */
    function deposit(bytes32 encryptedAmount, bytes calldata inputProof) external {
        // 1. pull confidential asset (uses ERC-7984 transferFrom semantics)
        asset.confidentialTransferFrom(msg.sender, address(this), encryptedAmount, inputProof);

        // 2. mint matching encrypted shares (1:1 in BUILD 1; PPS in BUILD 2)
        shareToken.confidentialMint(msg.sender, encryptedAmount);

        emit Deposited(msg.sender);
    }

    /**
     * @notice Withdraw confidential `asset` from the vault by burning shares.
     */
    function withdraw(bytes32 encryptedShareAmount, bytes calldata inputProof) external {
        // 1. burn caller's encrypted share handle
        shareToken.confidentialBurn(msg.sender, encryptedShareAmount);

        // 2. push equal encrypted asset handle back. We use the *vault* as the
        //    proof signer here — in BUILD 2 this becomes a TEE attestation.
        bytes memory selfProof = abi.encodePacked(
            keccak256(abi.encodePacked(address(this), encryptedShareAmount))
        );
        asset.confidentialTransfer(msg.sender, encryptedShareAmount, selfProof);

        emit Withdrawn(msg.sender);
    }

    // -------------------------------------------------------------------------
    // Encrypted portfolio view
    // -------------------------------------------------------------------------

    /**
     * @notice Returns ONLY ciphertext handles for the per-strategy weights.
     *         Off-chain consumers must possess a TEE re-encryption permit to
     *         decrypt them.
     */
    function getEncryptedPortfolio()
        external
        view
        returns (bytes32[] memory ids, bytes32[] memory encryptedWeights)
    {
        uint256 n = strategyIds.length;
        ids              = new bytes32[](n);
        encryptedWeights = new bytes32[](n);
        for (uint256 i = 0; i < n; ++i) {
            bytes32 id = strategyIds[i];
            ids[i]              = id;
            encryptedWeights[i] = _strategyWeight[id];
        }
    }

    /// @notice Returns the encrypted total assets handle (held by the vault).
    function encryptedTotalAssets() external view returns (bytes32) {
        return asset.confidentialBalanceOf(address(this));
    }

    // -------------------------------------------------------------------------
    // AI rebalance loop
    // -------------------------------------------------------------------------

    /**
     * @notice Anyone can request a rebalance once the cool-down has elapsed.
     * @return id  Monotonic request id picked up by the off-chain TEE worker.
     */
    function requestRebalance() external returns (uint256 id) {
        if (block.timestamp < lastRebalanceAt + REBALANCE_COOLDOWN && lastRebalanceAt != 0) {
            revert CooldownActive();
        }
        unchecked { pendingRebalanceId += 1; }
        id = pendingRebalanceId;
        emit RebalanceRequested(id, msg.sender, block.timestamp);
    }

    /**
     * @notice Called by the iExec TEE worker once the ElizaOS optimiser has
     *         produced a new encrypted allocation vector.
     *
     * @param  id                 Pending rebalance id.
     * @param  ids                Strategy ids (must be already registered).
     * @param  encryptedWeights   New ciphertext handle for each strategy.
     * @param  newPortfolioRoot   Merkle/keccak commitment over the full set —
     *                            stored for off-chain auditability.
     *
     * @dev    BUILD 2 will additionally verify a TDX attestation quote.
     */
    function fulfilRebalance(
        uint256 id,
        bytes32[] calldata ids,
        bytes32[] calldata encryptedWeights,
        bytes32 newPortfolioRoot
    ) external onlyAiAgent {
        if (id != pendingRebalanceId)        revert AlreadyFulfilled();
        if (id <= completedRebalanceId)      revert AlreadyFulfilled();
        require(ids.length == encryptedWeights.length, "vault: len mismatch");

        for (uint256 i = 0; i < ids.length; ++i) {
            bytes32 sId = ids[i];
            if (_strategyWeight[sId] == bytes32(0)) revert UnknownStrategy();
            _strategyWeight[sId] = encryptedWeights[i];
        }

        completedRebalanceId = id;
        lastRebalanceAt      = block.timestamp;
        emit RebalanceFulfilled(id, newPortfolioRoot);
    }

    // -------------------------------------------------------------------------
    // Introspection
    // -------------------------------------------------------------------------

    function strategyCount() external view returns (uint256) {
        return strategyIds.length;
    }
}
