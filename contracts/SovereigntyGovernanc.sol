// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// SovereigntyGovernance -- Parameter registry with timelock

contract SovereigntyGovernance {
    address public immutable OPERATOR;

    mapping(string => bytes32) public params;
    uint256 public constant TIMELOCK = 24 hours;

    struct Change { string param; bytes32 oldVal; bytes32 newVal; uint256 ts; }
    Change[] public changelog;

    struct TLOp { bytes32 id; uint256 eta; bool done; }
    mapping(bytes32 => TLOp) public timelocks;

    event ParamSet(string param, bytes32 newVal);
    event TimelockQueued(bytes32 id, uint256 eta);
    event TimelockExecuted(bytes32 id);

    modifier onlyOperator() { require(msg.sender == OPERATOR, "SGOV: op"); _; }

    constructor(address _op) {
        OPERATOR = _op;
        // SP1-SP5 sub-propeller levels (USD/day with 0 decimals)
        params["SP1_TARGET"] = bytes32(uint256(10_000));          // $10K
        params["SP2_TARGET"] = bytes32(uint256(50_000));          // $50K
        params["SP3_TARGET"] = bytes32(uint256(200_000));         // $200K
        params["SP4_TARGET"] = bytes32(uint256(500_000));         // $500K
        params["SP5_TARGET"] = bytes32(uint256(1_000_000_000));   // $1B = P1
        // P1-P10 (same as SP5/P1 onwards)
        params["P1_TARGET"]  = bytes32(uint256(1_000_000_000));   // $1B
        params["P5_TARGET"]  = bytes32(uint256(2_401_000_000_000)); // $2.401T default
        params["P10_TARGET"] = bytes32(uint256(10_000_000_000_000_000_000_000)); // $10 QUI
        params["DEFAULT_PROPELLER"] = bytes32(uint256(5));        // P5 default
        params["EXTRACTION_RATE"]   = bytes32(uint256(1000));     // 10%
        params["GAS_CAP_GWEI"]      = bytes32(uint256(1000));     // 1000 gwei
        params["RECON_INTERVAL"]    = bytes32(uint256(100));      // every 100 cycles
    }

    function setParam(string calldata p, bytes32 v) external onlyOperator {
        bytes32 old = params[p];
        params[p]   = v;
        changelog.push(Change(p, old, v, block.timestamp));
        emit ParamSet(p, v);
    }

    function queueTimelock(bytes32 id, bytes calldata) external onlyOperator {
        timelocks[id] = TLOp(id, block.timestamp + TIMELOCK, false);
        emit TimelockQueued(id, block.timestamp + TIMELOCK);
    }

    function executeTimelock(bytes32 id) external onlyOperator {
        TLOp storage t = timelocks[id];
        require(!t.done && block.timestamp >= t.eta, "SGOV: timelock");
        t.done = true;
        emit TimelockExecuted(id);
    }

    function getParam(string calldata p) external view returns (bytes32) { return params[p]; }
    function changelogLen() external view returns (uint256) { return changelog.length; }
}
