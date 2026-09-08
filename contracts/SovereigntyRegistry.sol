// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// SovereigntyRegistry -- Chain allowlist + pool registry

contract SovereigntyRegistry {
    address public immutable OPERATOR;

    struct Chain { uint256 id; string name; bool active; }
    struct Pool  { address addr; string protocol; bool active; }

    Chain[] public chains;
    Pool[]  public pools;
    mapping(uint256 => bool) public chainReg;
    mapping(address => bool) public poolReg;

    event ChainAdded(uint256 id, string name);
    event PoolAdded(address pool, string protocol);

    modifier onlyOperator() { require(msg.sender == OPERATOR, "SREG: op"); _; }

    constructor(address _op) {
        OPERATOR = _op;
        _chain(137,    "polygon");
        _chain(42161,  "arbitrum");
        _chain(8453,   "base");
        _chain(10,     "optimism");
        _chain(1,      "ethereum");
        _chain(56,     "bnb");
        _chain(43114,  "avax");
        _chain(81457,  "blast");
        _chain(324,    "zksync");
        _chain(534352, "scroll");
        _chain(59144,  "linea");
        _chain(5000,   "mantle");
        _chain(100,    "gnosis");
        _chain(480,    "worldchain");
        _chain(80094,  "berachain");
        _chain(130,    "unichain");
        _chain(1329,   "sei");
        _chain(146,    "sonic");
        _chain(146,    "sonic2");
        _chain(137,    "polygon2");
    }

    function _chain(uint256 id, string memory name) internal {
        chains.push(Chain(id, name, true));
        chainReg[id] = true;
        emit ChainAdded(id, name);
    }

    function addChain(uint256 id, string calldata name) external onlyOperator {
        require(!chainReg[id], "SREG: chain exists");
        _chain(id, name);
    }

    function addPool(address pool, string calldata protocol) external onlyOperator {
        require(!poolReg[pool], "SREG: pool exists");
        pools.push(Pool(pool, protocol, true));
        poolReg[pool] = true;
        emit PoolAdded(pool, protocol);
    }

    function chainCount() external view returns (uint256) { return chains.length; }
    function poolCount()  external view returns (uint256) { return pools.length; }
}
