// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title GhostRegistry — SIGIL content ownership registry
contract GhostRegistry {
    struct ContentRecord {
        address owner;
        string contentHash;
        string ipfsLink;
        string watermarkPattern;
        uint8 terms; // 0=none, 1=noncommercial, 2=paid
        uint256 timestamp;
        uint256 earnings;
    }

    // contentHash => record
    mapping(string => ContentRecord) public registry;

    // owner => list of contentHashes
    mapping(address => string[]) private ownerContent;

    event ContentRegistered(address indexed owner, string contentHash, uint256 timestamp);
    event MatchFlagged(string contentHash, string evidence, uint256 timestamp);

    function registerContent(
        string calldata contentHash,
        string calldata ipfsLink,
        string calldata watermarkPattern,
        uint8 terms
    ) external {
        require(registry[contentHash].owner == address(0), "Already registered");
        registry[contentHash] = ContentRecord({
            owner: msg.sender,
            contentHash: contentHash,
            ipfsLink: ipfsLink,
            watermarkPattern: watermarkPattern,
            terms: terms,
            timestamp: block.timestamp,
            earnings: 0
        });
        ownerContent[msg.sender].push(contentHash);
        emit ContentRegistered(msg.sender, contentHash, block.timestamp);
    }

    function getOwner(string calldata contentHash) external view returns (address) {
        return registry[contentHash].owner;
    }

    function getMyContent(address owner) external view returns (string[] memory) {
        return ownerContent[owner];
    }

    function flagMatch(string calldata contentHash, string calldata evidence) external {
        emit MatchFlagged(contentHash, evidence, block.timestamp);
    }
}
