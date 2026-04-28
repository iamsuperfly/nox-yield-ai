// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title IConfidentialFungibleToken (ERC-7984)
 * @notice Minimal interface for a Confidential Fungible Token whose balances and
 *         transfer amounts are encrypted ciphertext handles (not plaintext).
 * @dev    Aligned with the iExec Nox confidential contracts and the
 *         OpenZeppelin Confidential Contracts implementation of ERC-7984.
 *
 *         Balances are typed as `bytes32` ciphertext handles (`euint64` /
 *         `euint128` references) — they are NOT plain numbers. The runtime
 *         FHE library (Inco / TFHE) resolves them inside the TEE.
 */
interface IConfidentialFungibleToken {
    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted on a confidential transfer. Amount is NOT broadcast.
    event ConfidentialTransfer(address indexed from, address indexed to);

    /// @notice Emitted on (re-)issuance of an encrypted balance handle.
    event EncryptedBalanceUpdated(address indexed account, bytes32 newHandle);

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice ERC-7984 metadata.
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);

    /// @notice Returns the encrypted balance handle for `account`.
    ///         Decryption requires either (a) the holder's signature granting a
    ///         re-encryption permit, or (b) execution inside an authorised TEE.
    function confidentialBalanceOf(address account) external view returns (bytes32);

    /// @notice Returns the encrypted total supply handle.
    function confidentialTotalSupply() external view returns (bytes32);

    // -------------------------------------------------------------------------
    // Mutating
    // -------------------------------------------------------------------------

    /**
     * @notice Performs a confidential transfer. The `encryptedAmount` is a
     *         ciphertext handle produced client-side (or by the TEE).
     * @param  to               Recipient.
     * @param  encryptedAmount  Ciphertext handle (euint64) of the amount.
     * @param  inputProof       ZK / attestation proof binding the ciphertext
     *                          to the caller (see Nox FHE input proof spec).
     */
    function confidentialTransfer(
        address to,
        bytes32 encryptedAmount,
        bytes calldata inputProof
    ) external returns (bool);

    /**
     * @notice Approves `spender` to move up to `encryptedAmount` (ciphertext).
     */
    function confidentialApprove(
        address spender,
        bytes32 encryptedAmount,
        bytes calldata inputProof
    ) external returns (bool);

    /**
     * @notice Pulls a confidential allowance from `from` to `to`.
     */
    function confidentialTransferFrom(
        address from,
        address to,
        bytes32 encryptedAmount,
        bytes calldata inputProof
    ) external returns (bool);
}
