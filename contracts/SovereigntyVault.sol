// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// SovereigntyVault -- Live flash capacity registry
// Stores confirmed live flash amounts from algorithm.js reads
// Never uses static configured amounts -- always live

interface IERC20V {
    function balanceOf(address) external view returns (uint256);
    function transfer(address,uint256) external returns(bool);
}

contract SovereigntyVault {
    address public immutable OPERATOR;
    address public immutable TREASURY;

    // Live confirmed flash capacity (updated by operator from algorithm.js reads)
    uint256 public liveBalancerUSD;
    uint256 public liveAaveUSD;
    uint256 public liveTotalUSD;
    uint256 public lastLiveUpdate;
    uint256 public updateCount;

    struct AssetCapacity {
        address token;
        string  symbol;
        uint8   decimals;
        uint256 liveBalancerAmount;
        uint256 liveAaveAmount;
        bool    active;
    }

    AssetCapacity[] public assets;
    mapping(address => bool) public assetReg;

    event CapacityUpdated(uint256 balancer, uint256 aave, uint256 total, uint256 ts);
    event AssetAdded(address token, string symbol);

    modifier onlyOperator() { require(msg.sender == OPERATOR, "SV: op"); _; }

    constructor(address _op, address _treasury) {
        OPERATOR  = _op;
        TREASURY  = _treasury;
    }

    // Called by executor after every algorithm.js live flash read
    function updateLiveCapacity(
        uint256 balancerUSD,
        uint256 aaveUSD
    ) external onlyOperator {
        liveBalancerUSD  = balancerUSD;
        liveAaveUSD      = aaveUSD;
        liveTotalUSD     = balancerUSD + aaveUSD;
        lastLiveUpdate   = block.timestamp;
        updateCount++;
        emit CapacityUpdated(balancerUSD, aaveUSD, liveTotalUSD, block.timestamp);
    }

    function addAsset(
        address token,
        string calldata symbol,
        uint8 dec,
        uint256 balancerAmt,
        uint256 aaveAmt
    ) external onlyOperator {
        require(!assetReg[token], "SV: exists");
        assets.push(AssetCapacity(token, symbol, dec, balancerAmt, aaveAmt, true));
        assetReg[token] = true;
        emit AssetAdded(token, symbol);
    }

    function isStale() external view returns (bool) {
        return block.timestamp > lastLiveUpdate + 5 minutes;
    }

    function getTotalCap() external view returns (uint256) { return liveTotalUSD; }
    function assetCount() external view returns (uint256) { return assets.length; }

    function emergencySweep(address token) external onlyOperator {
        uint256 b = IERC20V(token).balanceOf(address(this));
        if (b > 0) IERC20V(token).transfer(TREASURY, b);
    }

    receive() external payable {}
}
