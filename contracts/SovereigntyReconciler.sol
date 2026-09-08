// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// SovereigntyReconciler -- On-chain treasury confirmation
// Every 100 cycles: reads actual treasury USDC balance
// Compares computed revenue vs confirmed on-chain balance
// Gap detection: flags discrepancy if computed > confirmed by > 5%
// This is the permanent answer to the core question

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
}

contract SovereigntyReconciler {
    address public immutable OPERATOR;
    address public immutable TREASURY;
    address public immutable SOVEREIGNTY;

    // USDC on Polygon
    address public constant USDC = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174;

    // Maximum acceptable gap between computed and confirmed (basis points)
    uint256 public maxGapBps = 500;  // 5%

    struct Reconciliation {
        uint256 cycleId;
        uint256 cycleCount;
        uint256 computedRevTotal;  // what the math says
        uint256 confirmedBalance;  // what is actually on-chain
        uint256 gapUSD;            // difference
        uint256 gapBps;            // gap in basis points
        bool    healthy;           // true if gap within threshold
        uint256 ts;
    }

    Reconciliation[] public history;
    Reconciliation   public latest;
    uint256 public totalReconciliations;
    uint256 public healthyCount;
    uint256 public gapCount;

    event Reconciled(
        uint256 indexed cycleId,
        uint256 computedRev,
        uint256 confirmedBalance,
        uint256 gapBps,
        bool healthy
    );
    event GapDetected(uint256 cycleId, uint256 computedRev, uint256 confirmedBalance, uint256 gapBps);

    modifier onlyAuth() {
        require(msg.sender == SOVEREIGNTY || msg.sender == OPERATOR, "SREC: auth");
        _;
    }
    modifier onlyOperator() { require(msg.sender == OPERATOR, "SREC: op"); _; }

    constructor(address _op, address _treasury, address _sovereignty) {
        OPERATOR    = _op;
        TREASURY    = _treasury;
        SOVEREIGNTY = _sovereignty;
    }

    // Called by Sovereignty contract every reconcileInterval cycles
    function recordCycle(
        uint256 cycleId,
        uint256 extracted,
        uint256 cycleCount
    ) external onlyAuth {
        // Read actual on-chain treasury balance -- this is the truth
        uint256 confirmedBalance = IERC20(USDC).balanceOf(TREASURY);

        // Compute accumulated revenue from this cycle forward
        // This is the computed number from the amplifier
        uint256 computedRevTotal = extracted * cycleCount;  // simplified -- actual tracked in Sovereignty

        // Gap analysis
        uint256 gapUSD = computedRevTotal > confirmedBalance
            ? computedRevTotal - confirmedBalance : 0;
        uint256 gapBps = computedRevTotal > 0
            ? (gapUSD * 10000) / computedRevTotal : 0;

        bool healthy = gapBps <= maxGapBps;

        Reconciliation memory rec = Reconciliation({
            cycleId:           cycleId,
            cycleCount:        cycleCount,
            computedRevTotal:  computedRevTotal,
            confirmedBalance:  confirmedBalance,
            gapUSD:            gapUSD,
            gapBps:            gapBps,
            healthy:           healthy,
            ts:                block.timestamp
        });

        history.push(rec);
        latest = rec;
        totalReconciliations++;

        if (healthy) healthyCount++;
        else {
            gapCount++;
            emit GapDetected(cycleId, computedRevTotal, confirmedBalance, gapBps);
        }

        emit Reconciled(cycleId, computedRevTotal, confirmedBalance, gapBps, healthy);
    }

    function getLatest() external view returns (Reconciliation memory) {
        return latest;
    }

    function getHistory(uint256 limit) external view returns (Reconciliation[] memory) {
        uint256 len  = history.length;
        uint256 n    = limit < len ? limit : len;
        Reconciliation[] memory out = new Reconciliation[](n);
        for (uint256 i; i < n; i++) {
            out[i] = history[len - n + i];
        }
        return out;
    }

    function healthRate() external view returns (uint256) {
        return totalReconciliations > 0
            ? (healthyCount * 10000) / totalReconciliations : 0;
    }

    function setMaxGap(uint256 bps) external onlyOperator {
        require(bps <= 5000, "SREC: max 50%");
        maxGapBps = bps;
    }
}
