// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// SovereigntyGuard -- replay prevention and double-execution protection

contract SovereigntyGuard {
    address public immutable OPERATOR;
    address public immutable SOVEREIGNTY;

    mapping(bytes32 => bool)    public executed;
    mapping(address => bool)    public blocked;
    mapping(bytes32 => uint256) public executedAt;

    uint256 public doubleExecPrevented;
    uint256 public blockedCount;

    bytes32[512] private _recentHashes;
    uint256      private _recentHead;

    event Blocked(bytes32 indexed cycleHash, string reason);
    event CallerBlocked(address indexed caller);

    modifier onlyAuth() {
        require(msg.sender == SOVEREIGNTY || msg.sender == OPERATOR, "SG: auth");
        _;
    }
    modifier onlyOperator() { require(msg.sender == OPERATOR, "SG: op"); _; }

    constructor(address _op, address _sov) {
        OPERATOR    = _op;
        SOVEREIGNTY = _sov;
    }

    function isSafe(bytes32 cycleHash) external view returns (bool) {
        if (executed[cycleHash])     return false;
        if (blocked[tx.origin])      return false;
        return true;
    }

    function record(bytes32 cycleHash) external onlyAuth {
        if (executed[cycleHash]) {
            doubleExecPrevented++;
            emit Blocked(cycleHash, "double_exec");
            return;
        }
        executed[cycleHash]   = true;
        executedAt[cycleHash] = block.number;
        _recentHashes[_recentHead % 512] = cycleHash;
        _recentHead++;
    }

    function blockCaller(address caller) external onlyOperator {
        blocked[caller] = true;
        blockedCount++;
        emit CallerBlocked(caller);
    }

    function unblockCaller(address caller) external onlyOperator {
        blocked[caller] = false;
    }
}
