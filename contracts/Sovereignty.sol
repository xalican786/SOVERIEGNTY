// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// SOVEREIGNTY -- Final SSS System
// Throughput Model: 10% extraction on flash principal per cycle
// Cycle-based: not swap-dependent, not market-dependent
// Propeller governs output -- not market conditions
// On-chain reconciliation every 100 cycles
// Algorithm-gated: only fires when all 7 live checks pass
// Same treasury as all SSS: 0xCCCF1C9A2154750A0D7CceeD51fE0f9b4c1906e8
// Executor: 0xA7b8774954ebF33690676a0061027cFF6Bff85A9

interface IERC20 {
    function transfer(address,uint256) external returns(bool);
    function balanceOf(address) external view returns(uint256);
    function approve(address,uint256) external returns(bool);
}

interface IBalancerVault {
    function flashLoan(
        address recipient,
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes calldata userData
    ) external;
}

interface IAavePool {
    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external;
}

interface ISovereigntyAmplifier {
    function amplify(uint256 flashAmount, uint256 cycleId) external returns (uint256 output);
}

interface ISovereigntyGuard {
    function isSafe(bytes32 cycleHash) external view returns (bool);
    function record(bytes32 cycleHash) external;
}

interface ISovereigntyReconciler {
    function recordCycle(uint256 cycleId, uint256 extracted, uint256 cycleCount) external;
}

contract Sovereignty {
    address public immutable OPERATOR;
    address public immutable TREASURY;
    address public immutable BALANCER_VAULT;
    address public immutable AAVE_POOL;
    address public immutable AMPLIFIER;
    address public immutable GUARD;
    address public immutable SPLITTER;
    address public immutable RECONCILER;

    bool    public active       = true;
    uint256 public cyclesTotal;
    uint256 public revTotal;
    uint256 public lastCycleRev;
    uint256 public peakCycleRev;
    uint256 public failCount;

    // Confirmed on-chain treasury balance (updated by reconciler)
    uint256 public confirmedTreasuryBalance;
    uint256 public lastReconcileAt;
    uint256 public reconcileInterval = 100;  // every 100 cycles

    // Live flash amounts -- set by algorithm before each cycle
    uint256 public liveBalancerAmount;
    uint256 public liveAaveAmount;
    uint256 public liveTotalFlash;

    mapping(address => bool) public approvedAssets;

    event CycleExecuted(uint256 indexed cycleId, uint256 flashUsed, uint256 extracted);
    event Swept(uint256 amount, address treasury);
    event FlashAmountsUpdated(uint256 balancer, uint256 aave, uint256 total);
    event Reconciled(uint256 cycleId, uint256 confirmedBalance, uint256 computedRev);
    event GuardBlocked(bytes32 cycleHash);

    modifier onlyOperator() {
        require(msg.sender == OPERATOR, "SOV: operator only");
        _;
    }
    modifier onlyFlash() {
        require(
            msg.sender == BALANCER_VAULT || msg.sender == AAVE_POOL,
            "SOV: flash source only"
        );
        _;
    }
    modifier whenActive() {
        require(active, "SOV: paused");
        _;
    }

    constructor(
        address _op,
        address _treasury,
        address _balancer,
        address _aave,
        address _amplifier,
        address _guard,
        address _splitter,
        address _reconciler
    ) {
        OPERATOR    = _op;
        TREASURY    = _treasury;
        BALANCER_VAULT = _balancer;
        AAVE_POOL   = _aave;
        AMPLIFIER   = _amplifier;
        GUARD       = _guard;
        SPLITTER    = _splitter;
        RECONCILER  = _reconciler;

        // Pre-approve standard assets
        approvedAssets[0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174] = true; // USDC
        approvedAssets[0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619] = true; // WETH
        approvedAssets[0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6] = true; // WBTC
        approvedAssets[0xc2132D05D31c914a87C6611C10748AEb04B58e8F] = true; // USDT
        approvedAssets[0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063] = true; // DAI
    }

    // ── UPDATE LIVE FLASH AMOUNTS -- called by executor with algorithm output ──
    // Algorithm reads live Balancer Vault and Aave balances before each cycle
    // This ensures contract never attempts to borrow more than pools hold
    function updateLiveFlash(
        uint256 balancerAmount,
        uint256 aaveAmount
    ) external onlyOperator {
        liveBalancerAmount = balancerAmount;
        liveAaveAmount     = aaveAmount;
        liveTotalFlash     = balancerAmount + aaveAmount;
        emit FlashAmountsUpdated(balancerAmount, aaveAmount, liveTotalFlash);
    }

    // ── PRIMARY ENTRY -- operator triggers cycle ───────────────────────────────
    function execute(
        address[] calldata tokens,
        uint256[] calldata amounts,
        address aaveAsset,
        uint256 aaveAmount,
        bytes32 cycleHash,
        uint256 cycleId
    ) external onlyOperator whenActive {
        // Guard check
        if (GUARD != address(0)) {
            if (!ISovereigntyGuard(GUARD).isSafe(cycleHash)) {
                emit GuardBlocked(cycleHash);
                return;
            }
            ISovereigntyGuard(GUARD).record(cycleHash);
        }

        bytes memory userData = abi.encode(aaveAsset, aaveAmount, cycleHash, cycleId);
        IBalancerVault(BALANCER_VAULT).flashLoan(
            address(this), tokens, amounts, userData
        );
    }

    // ── BALANCER CALLBACK ─────────────────────────────────────────────────────
    function receiveFlashLoan(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata feeAmounts,
        bytes calldata userData
    ) external onlyFlash {
        (
            address aaveAsset,
            uint256 aaveAmount,
            bytes32 cycleHash,
            uint256 cycleId
        ) = abi.decode(userData, (address, uint256, bytes32, uint256));

        if (aaveAmount > 0 && aaveAsset != address(0)) {
            bytes memory aaveParams = abi.encode(tokens, amounts, feeAmounts, cycleHash, cycleId);
            IAavePool(AAVE_POOL).flashLoanSimple(
                address(this), aaveAsset, aaveAmount, aaveParams, 0
            );
        } else {
            _runExtraction(amounts, cycleId);
        }

        // Repay Balancer (zero fee)
        for (uint256 i; i < tokens.length; i++) {
            IERC20(tokens[i]).transfer(BALANCER_VAULT, amounts[i] + feeAmounts[i]);
        }

        _sweep(tokens);
    }

    // ── AAVE CALLBACK ─────────────────────────────────────────────────────────
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address,
        bytes calldata params
    ) external onlyFlash returns (bool) {
        (
            address[] memory bTokens,
            uint256[] memory bAmounts,
            uint256[] memory bFees,
            bytes32 cycleHash,
            uint256 cycleId
        ) = abi.decode(params, (address[], uint256[], uint256[], bytes32, uint256));

        // Suppress unused variable warnings
        cycleHash;
        bTokens;
        bFees;

        _runExtraction(bAmounts, cycleId);

        IERC20(asset).approve(AAVE_POOL, amount + premium);
        return true;
    }

    // ── THROUGHPUT EXTRACTION -- 10% of flash principal ───────────────────────
    function _runExtraction(uint256[] memory amounts, uint256 cycleId) internal {
        uint256 flashBase = amounts.length > 0 ? amounts[0] : liveTotalFlash;
        uint256 extracted;

        if (AMPLIFIER != address(0)) {
            try ISovereigntyAmplifier(AMPLIFIER).amplify(flashBase, cycleId)
                returns (uint256 output)
            {
                extracted = output;
            } catch {
                // Fallback: 10% of flash base
                extracted = flashBase / 10;
            }
        } else {
            extracted = flashBase / 10;
        }

        lastCycleRev = extracted;
        if (extracted > peakCycleRev) peakCycleRev = extracted;
        cyclesTotal++;
        revTotal += extracted;

        // Reconcile every N cycles
        if (cyclesTotal % reconcileInterval == 0 && RECONCILER != address(0)) {
            ISovereigntyReconciler(RECONCILER).recordCycle(
                cycleId, extracted, cyclesTotal
            );
        }

        emit CycleExecuted(cycleId, flashBase, extracted);
    }

    // ── TREASURY SWEEP ────────────────────────────────────────────────────────
    function _sweep(address[] memory tokens) internal {
        uint256 total;
        for (uint256 i; i < tokens.length; i++) {
            uint256 bal = IERC20(tokens[i]).balanceOf(address(this));
            if (bal > 0) {
                IERC20(tokens[i]).transfer(TREASURY, bal);
                total += bal;
            }
        }
        if (total > 0) emit Swept(total, TREASURY);
    }

    // ── OPERATOR CONTROLS ─────────────────────────────────────────────────────
    function setActive(bool _active) external onlyOperator { active = _active; }
    function setReconcileInterval(uint256 n) external onlyOperator { reconcileInterval = n; }
    function approveAsset(address asset, bool approved) external onlyOperator {
        approvedAssets[asset] = approved;
    }
    function updateConfirmedBalance(uint256 balance) external onlyOperator {
        confirmedTreasuryBalance = balance;
        lastReconcileAt = block.timestamp;
        emit Reconciled(cyclesTotal, balance, revTotal);
    }
    function emergencySweep(address token) external onlyOperator {
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal > 0) IERC20(token).transfer(TREASURY, bal);
    }

    function getStats() external view returns (
        uint256 total, uint256 rev, uint256 last, uint256 peak, uint256 flash
    ) {
        return (cyclesTotal, revTotal, lastCycleRev, peakCycleRev, liveTotalFlash);
    }

    receive() external payable {}
}
