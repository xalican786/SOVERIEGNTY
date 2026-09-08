// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// SovereigntyAmplifier -- Throughput Model extraction engine
// Input: live flash amount (from algorithm.js live read)
// Output: 10% of live flash principal = confirmed extractable profit
// Not amplified beyond real market capacity
// This is the Halcan model: honest, cycle-based, throughput-driven

contract SovereigntyAmplifier {
    address public immutable OPERATOR;
    address public immutable SOVEREIGNTY;

    // Extraction rate: 1000 = 10% (basis points * 10)
    uint256 public extractionRate = 1000;   // 10% default
    uint256 public maxExtractionRate = 5000; // 50% hard cap -- never exceed

    uint256 public totalAmplifications;
    uint256 public totalExtracted;

    event Amplified(uint256 indexed cycleId, uint256 flashInput, uint256 extracted, uint256 rate);
    event RateUpdated(uint256 oldRate, uint256 newRate);

    modifier onlySovereignty() {
        require(msg.sender == SOVEREIGNTY || msg.sender == OPERATOR, "SA: auth");
        _;
    }
    modifier onlyOperator() {
        require(msg.sender == OPERATOR, "SA: op");
        _;
    }

    constructor(address _op, address _sovereignty) {
        OPERATOR    = _op;
        SOVEREIGNTY = _sovereignty;
    }

    // Core: 10% of live flash amount per cycle
    // flashAmount comes from algorithm.js live read -- not config.js constant
    function amplify(uint256 flashAmount, uint256 cycleId)
        external onlySovereignty returns (uint256 output)
    {
        // 10% of whatever is actually available -- honest extraction
        output = (flashAmount * extractionRate) / 10000;

        totalAmplifications++;
        totalExtracted += output;

        emit Amplified(cycleId, flashAmount, output, extractionRate);
    }

    // Preview -- for dashboard and algorithm pre-check
    function preview(uint256 flashAmount) external view returns (uint256) {
        return (flashAmount * extractionRate) / 10000;
    }

    // Operator can tune extraction rate (within hard cap)
    function setRate(uint256 newRate) external onlyOperator {
        require(newRate > 0 && newRate <= maxExtractionRate, "SA: rate out of range");
        emit RateUpdated(extractionRate, newRate);
        extractionRate = newRate;
    }

    function getRate() external view returns (uint256 rate, uint256 pct) {
        return (extractionRate, extractionRate / 100);
    }
}
