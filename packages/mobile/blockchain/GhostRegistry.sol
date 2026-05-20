// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title GhostRegistry
 * @notice SIGIL — On-chain IP fingerprint registry
 * @dev Stores SHA-256 content hashes with owner + IPFS metadata.
 *      Deployed on Polygon Mumbai (testnet) or Polygon mainnet.
 */
contract GhostRegistry {
    // ─────────────────────────────────────────────────────────────────────────
    //  STRUCTS
    // ─────────────────────────────────────────────────────────────────────────

    struct Registration {
        bytes32  contentHash;   // SHA-256 of original content (bytes32)
        address  owner;         // Wallet that registered
        string   ipfsCid;       // IPFS CID of encrypted asset metadata
        string   assetName;     // Human-readable asset name
        uint256  timestamp;     // Block timestamp at registration
        bool     exists;        // Guard flag
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  STATE
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev contentHash → Registration
    mapping(bytes32 => Registration) private _registry;

    /// @dev owner → list of their content hashes
    mapping(address => bytes32[]) private _ownerAssets;

    // ─────────────────────────────────────────────────────────────────────────
    //  EVENTS
    // ─────────────────────────────────────────────────────────────────────────

    event AssetRegistered(
        bytes32 indexed contentHash,
        address indexed owner,
        string  ipfsCid,
        string  assetName,
        uint256 timestamp
    );

    event AssetTransferred(
        bytes32 indexed contentHash,
        address indexed from,
        address indexed to
    );

    // ─────────────────────────────────────────────────────────────────────────
    //  ERRORS
    // ─────────────────────────────────────────────────────────────────────────

    error AlreadyRegistered(bytes32 contentHash);
    error NotRegistered(bytes32 contentHash);
    error NotOwner(bytes32 contentHash, address caller);
    error ZeroAddress();

    // ─────────────────────────────────────────────────────────────────────────
    //  WRITE FUNCTIONS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Register a new content fingerprint.
     * @param contentHash  SHA-256 hash of the original asset (as bytes32)
     * @param ipfsCid      IPFS CID pointing to encrypted metadata JSON
     * @param assetName    Human-readable name (e.g. "My Song v1.mp3")
     */
    function register(
        bytes32 contentHash,
        string calldata ipfsCid,
        string calldata assetName
    ) external {
        if (_registry[contentHash].exists) revert AlreadyRegistered(contentHash);

        _registry[contentHash] = Registration({
            contentHash : contentHash,
            owner       : msg.sender,
            ipfsCid     : ipfsCid,
            assetName   : assetName,
            timestamp   : block.timestamp,
            exists      : true
        });

        _ownerAssets[msg.sender].push(contentHash);

        emit AssetRegistered(contentHash, msg.sender, ipfsCid, assetName, block.timestamp);
    }

    /**
     * @notice Transfer ownership of a registered asset to a new address.
     * @param contentHash  Hash of the asset to transfer
     * @param newOwner     Recipient address
     */
    function transfer(bytes32 contentHash, address newOwner) external {
        if (!_registry[contentHash].exists)    revert NotRegistered(contentHash);
        if (_registry[contentHash].owner != msg.sender) revert NotOwner(contentHash, msg.sender);
        if (newOwner == address(0))            revert ZeroAddress();

        address previous = _registry[contentHash].owner;
        _registry[contentHash].owner = newOwner;

        _ownerAssets[newOwner].push(contentHash);
        // Note: we do NOT remove from previous owner array (gas tradeoff); use events to track.

        emit AssetTransferred(contentHash, previous, newOwner);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  READ FUNCTIONS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Check if a content hash is already registered.
     */
    function isRegistered(bytes32 contentHash) external view returns (bool) {
        return _registry[contentHash].exists;
    }

    /**
     * @notice Get the owner of a registered hash.
     */
    function ownerOf(bytes32 contentHash) external view returns (address) {
        if (!_registry[contentHash].exists) revert NotRegistered(contentHash);
        return _registry[contentHash].owner;
    }

    /**
     * @notice Get the full registration record for a hash.
     */
    function getRegistration(bytes32 contentHash)
        external
        view
        returns (Registration memory)
    {
        if (!_registry[contentHash].exists) revert NotRegistered(contentHash);
        return _registry[contentHash];
    }

    /**
     * @notice Get all asset hashes registered by a specific owner.
     */
    function getAssetsByOwner(address owner)
        external
        view
        returns (bytes32[] memory)
    {
        return _ownerAssets[owner];
    }

    /**
     * @notice Verify that a given hash belongs to a claimed owner.
     * @return true if hash is registered AND owner matches
     */
    function verify(bytes32 contentHash, address claimedOwner)
        external
        view
        returns (bool)
    {
        return _registry[contentHash].exists &&
               _registry[contentHash].owner == claimedOwner;
    }
}
