// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// SovereigntyOracle -- On-chain 7-point pre-execution validation
// Records algorithm.js check results on-chain for audit
// Does NOT perform live checks itself (too expensive on-chain)
// algorithm.js performs checks off-chain, stores results here

interface AggregatorV3Interface {
    function latestRoundData() external view
        returns (uint80, int256, uint256, uint256, uint80);
}

contract SovereigntyOracle {
    address public immutable OPERATOR;

    // Verified Chainlink feeds -- Polygon mainnet (all 40 hex digits verified)
    address public constant ETH_USD   = 0xF9680D99D6C9589e2a93a78A04A279e509205945;
    address public constant BTC_USD   = 0xc907E116054Ad103354f2D350FD2514433D57F6f;
    address public constant MATIC_USD = 0xAB594600376Ec9fD91F8e885dADF0CE036862dE0;
    address public constant USDC_USD  = 0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7;

    // Last algorithm check results -- stored for on-chain audit
    struct AlgorithmCheck {
        bool    passed;
        uint256 liveFlashBalancer;
        uint256 liveFlashAave;
        uint256 liveFlashTotal;
        uint256 gasGwei;
        uint256 ethPrice;
        uint256 maticPrice;
        uint256 treasuryBalance;
        uint256 ts;
    }

    AlgorithmCheck public lastCheck;
    uint256 public checkCount;
    uint256 public passCount;
    uint256 public failCount;

    event CheckRecorded(
        uint256 indexed checkId,
        bool passed,
        uint256 liveFlash,
        uint256 ts
    );

    modifier onlyOperator() { require(msg.sender == OPERATOR, "SORACLE: op"); _; }

    constructor(address _op) { OPERATOR = _op; }

    // Record algorithm.js check results on-chain
    // Called by executor before each cycle
    function recordCheck(
        bool passed,
        uint256 liveFlashBalancer,
        uint256 liveFlashAave,
        uint256 gasGwei,
        uint256 ethPrice,
        uint256 maticPrice,
        uint256 treasuryBalance
    ) external onlyOperator {
        checkCount++;
        if (passed) passCount++;
        else failCount++;

        lastCheck = AlgorithmCheck({
            passed:            passed,
            liveFlashBalancer: liveFlashBalancer,
            liveFlashAave:     liveFlashAave,
            liveFlashTotal:    liveFlashBalancer + liveFlashAave,
            gasGwei:           gasGwei,
            ethPrice:          ethPrice,
            maticPrice:        maticPrice,
            treasuryBalance:   treasuryBalance,
            ts:                block.timestamp
        });

        emit CheckRecorded(checkCount, passed, liveFlashBalancer + liveFlashAave, block.timestamp);
    }

    // Read live Chainlink price -- used by algorithm.js for calibration
    function getETHPrice() external view returns (uint256) {
        try AggregatorV3Interface(ETH_USD).latestRoundData()
            returns (uint80, int256 answer, uint256, uint256, uint80)
        { return answer > 0 ? uint256(answer) : 0; }
        catch { return 0; }
    }

    function getMATICPrice() external view returns (uint256) {
        try AggregatorV3Interface(MATIC_USD).latestRoundData()
            returns (uint80, int256 answer, uint256, uint256, uint80)
        { return answer > 0 ? uint256(answer) : 0; }
        catch { return 0; }
    }

    function getLastCheck() external view returns (AlgorithmCheck memory) {
        return lastCheck;
    }

    function getPassRate() external view returns (uint256) {
        return checkCount > 0 ? (passCount * 10000) / checkCount : 0;
    }
}
