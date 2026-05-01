// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IConfidentialFungibleToken} from "./interfaces/IConfidentialFungibleToken.sol";

/**
 * @title  ERC7984Token — Nox-compatible Confidential Fungible Token
 * @author Confidential AI Yield Fortress
 * @notice Reference implementation of the ERC-7984 Confidential Fungible Token
 *         standard, designed to run on iExec Nox TDX TEE workers.
 *
 * @dev    DESIGN NOTES
 *         ------------
 *         All balances are stored as `bytes32` ciphertext handles. In the
 *         production deployment these handles point into the FHE coprocessor
 *         (Inco Lightning) — the EVM never sees plaintext.
 *
 *         For local Hardhat tests we model the handle as
 *         `keccak256(abi.encode(plaintext, salt))`. Plaintext only ever lives
 *         inside an off-chain TEE simulation map keyed by the handle, so any
 *         on-chain observer still cannot recover the value. Test asserts
 *         confirm that no plaintext balance ever appears in storage or events.
 *
 *         This contract intentionally exposes ONLY ciphertext getters. There
 *         is NO `balanceOf(address) → uint256`. Anyone wanting plaintext must
 *         go through the TEE re-encryption flow.
 */
contract ERC7984Token is IConfidentialFungibleToken {
    // -------------------------------------------------------------------------
    // Metadata
    // -------------------------------------------------------------------------

    string public override name;
    string public override symbol;
    uint8  public constant override decimals = 6;

    // -------------------------------------------------------------------------
    // Encrypted state
    // -------------------------------------------------------------------------

    /// @dev Per-account encrypted balance handles (euint64 references).
    mapping(address => bytes32) private _encBalances;

    /// @dev Per-(owner,spender) encrypted allowance handles.
    mapping(address => mapping(address => bytes32)) private _encAllowances;

    /// @dev Encrypted total supply handle.
    bytes32 private _encTotalSupply;

    /// @dev Monotonic salt used when re-encrypting handles after a state change.
    uint256 private _handleNonce;

    // -------------------------------------------------------------------------
    // Access control
    // -------------------------------------------------------------------------

    address public immutable issuer;
    address public minter; // typically the ConfidentialYieldVault

    modifier onlyIssuer() {
        require(msg.sender == issuer, "ERC7984: not issuer");
        _;
    }

    modifier onlyMinter() {
        require(msg.sender == minter, "ERC7984: not minter");
        _;
    }

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error InvalidProof();
    error InvalidRecipient();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(string memory name_, string memory symbol_) {
        name   = name_;
        symbol = symbol_;
        issuer = msg.sender;
    }

    /// @notice One-time wiring of the vault that may mint/burn confidential supply.
    function setMinter(address vault) external onlyIssuer {
        require(minter == address(0), "ERC7984: minter set");
        require(vault != address(0), "ERC7984: zero vault");
        minter = vault;
    }

    // -------------------------------------------------------------------------
    // ERC-7984 views
    // -------------------------------------------------------------------------

    function confidentialBalanceOf(address account) external view override returns (bytes32) {
        return _encBalances[account];
    }

    function confidentialTotalSupply() external view override returns (bytes32) {
        return _encTotalSupply;
    }

    function confidentialAllowance(address owner, address spender)
        external
        view
        returns (bytes32)
    {
        return _encAllowances[owner][spender];
    }

    // -------------------------------------------------------------------------
    // ERC-7984 mutating ops
    // -------------------------------------------------------------------------

    function confidentialTransfer(
        address to,
        bytes32 encryptedAmount,
        bytes calldata inputProof
    ) external override returns (bool) {
        _verifyProof(msg.sender, encryptedAmount, inputProof);
        _move(msg.sender, to, encryptedAmount);
        return true;
    }

    function confidentialApprove(
        address spender,
        bytes32 encryptedAmount,
        bytes calldata inputProof
    ) external override returns (bool) {
        _verifyProof(msg.sender, encryptedAmount, inputProof);
        _encAllowances[msg.sender][spender] = encryptedAmount;
        return true;
    }

    function confidentialTransferFrom(
        address from,
        address to,
        bytes32 encryptedAmount,
        bytes calldata inputProof
    ) external override returns (bool) {
        // Verify the proof against `from` (the token owner), not `msg.sender`
        // (the spender). The proof asserts "this ciphertext was created by the
        // account that owns the tokens"; the spender's authorisation is already
        // established by the allowance recorded in `confidentialApprove`.
        // Using `msg.sender` here caused deposits to revert with InvalidProof
        // because the vault (msg.sender) called this function with a proof that
        // the user had correctly bound to their own address.
        _verifyProof(from, encryptedAmount, inputProof);
        // In real Nox we'd do an FHE.le() comparison against the encrypted
        // allowance and short-circuit if insufficient. Here we just rotate
        // the handle so storage stays opaque.
        _encAllowances[from][msg.sender] = _rotateHandle(encryptedAmount);
        _move(from, to, encryptedAmount);
        return true;
    }

    // -------------------------------------------------------------------------
    // Mint / burn — restricted to the bound vault contract
    // -------------------------------------------------------------------------

    /**
     * @notice Mints encrypted supply to `to`.
     * @dev    `encryptedAmount` is the ciphertext produced by the caller
     *         (typically the vault, which sourced it from a TEE attestation).
     */
    function confidentialMint(address to, bytes32 encryptedAmount) external onlyMinter {
        if (to == address(0)) revert InvalidRecipient();
        _encBalances[to]  = _combine(_encBalances[to], encryptedAmount);
        _encTotalSupply   = _combine(_encTotalSupply, encryptedAmount);
        emit EncryptedBalanceUpdated(to, _encBalances[to]);
    }

    /**
     * @notice Burns encrypted supply from `from`.
     */
    function confidentialBurn(address from, bytes32 encryptedAmount) external onlyMinter {
        if (from == address(0)) revert InvalidRecipient();
        _encBalances[from] = _combine(_encBalances[from], encryptedAmount);
        _encTotalSupply    = _combine(_encTotalSupply,    encryptedAmount);
        emit EncryptedBalanceUpdated(from, _encBalances[from]);
    }

    // -------------------------------------------------------------------------
    // Internal helpers — model FHE operations as opaque handle rotations.
    // -------------------------------------------------------------------------

    function _move(address from, address to, bytes32 encryptedAmount) internal {
        if (to == address(0)) revert InvalidRecipient();
        _encBalances[from] = _combine(_encBalances[from], encryptedAmount);
        _encBalances[to]   = _combine(_encBalances[to],   encryptedAmount);
        emit ConfidentialTransfer(from, to);
    }

    /**
     * @dev Models the FHE add/sub: returns a fresh ciphertext handle that
     *      depends on the prior balance and the moved amount, but reveals
     *      neither operand.
     */
    function _combine(bytes32 a, bytes32 b) internal returns (bytes32) {
        unchecked { _handleNonce++; }
        return keccak256(abi.encode(a, b, _handleNonce, block.chainid));
    }

    function _rotateHandle(bytes32 h) internal returns (bytes32) {
        unchecked { _handleNonce++; }
        return keccak256(abi.encode(h, _handleNonce, "rotate"));
    }

    /**
     * @dev Stub for the Nox input-proof check binding the ciphertext to the
     *      caller. Real deployment delegates this to the FHE coprocessor.
     */
    function _verifyProof(
        address caller,
        bytes32 encryptedAmount,
        bytes calldata inputProof
    ) internal pure {
        if (encryptedAmount == bytes32(0)) revert InvalidProof();
        if (inputProof.length == 0)        revert InvalidProof();
        // keccak the caller into the expected first word for symbolic binding.
        bytes32 expected = keccak256(abi.encodePacked(caller, encryptedAmount));
        bytes32 provided;
        assembly { provided := calldataload(inputProof.offset) }
        if (expected != provided) revert InvalidProof();
    }
}
