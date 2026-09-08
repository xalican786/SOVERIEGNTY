// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// SovereigntyFlash -- Live flash orchestrator
// Reads actual vault balances before initiating any flash loan
// Never borrows more than pool holds -- algorithm.js feeds live amounts
// Balancer 0% fee + Aave 0.05% fee

interface IERC20 {
    function transfer(address,uint256) external returns(bool);
    function balanceOf(address) external view returns(uint256);
    function approve(address,uint256) external returns(bool);
    function transferFrom(address,address,uint256) external returns(bool);
}

contract SovereigntyFlash {
    address public immutable OPERATOR;
    address public immutable SOVEREIGNTY;
    address public immutable BALANCER_VAULT;
    address public immutable AAVE_POOL;
    address public immutable TREASURY;

    bool private _inFlash;

    event FlashInitiated(bytes32 cycleHash, uint256 balancerAmt, uint256 aaveAmt);
    event FlashRepaid(string protocol, uint256 amount);

    modifier noReentrant() {
        require(!_inFlash, "SFL: reentrant");
        _inFlash = true;
        _;
        _inFlash = false;
    }

    constructor(
        address _op, address _sov,
        address _balancer, address _aave, address _treasury
    ) {
        OPERATOR       = _op;
        SOVEREIGNTY    = _sov;
        BALANCER_VAULT = _balancer;
        AAVE_POOL      = _aave;
        TREASURY       = _treasury;
    }

    function initiateFlash(
        address[] calldata tokens,
        uint256[] calldata amounts,
        address aaveAsset,
        uint256 aaveAmount,
        bytes32 cycleHash
    ) external noReentrant {
        require(msg.sender == SOVEREIGNTY || msg.sender == OPERATOR, "SFL: auth");

        emit FlashInitiated(cycleHash, amounts.length > 0 ? amounts[0] : 0, aaveAmount);

        bytes memory userData = abi.encode(aaveAsset, aaveAmount, cycleHash);
        (bool ok,) = BALANCER_VAULT.call(
            abi.encodeWithSignature(
                "flashLoan(address,address[],uint256[],bytes)",
                address(this), tokens, amounts, userData
            )
        );
        require(ok, "SFL: Balancer flash failed");
    }

    function receiveFlashLoan(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata feeAmounts,
        bytes calldata userData
    ) external {
        require(msg.sender == BALANCER_VAULT, "SFL: not balancer");
        (address aaveAsset, uint256 aaveAmount,) = abi.decode(userData, (address, uint256, bytes32));

        if (aaveAmount > 0 && aaveAsset != address(0)) {
            bytes memory p = abi.encode(tokens, amounts);
            (bool ok,) = AAVE_POOL.call(
                abi.encodeWithSignature(
                    "flashLoanSimple(address,address,uint256,bytes,uint16)",
                    address(this), aaveAsset, aaveAmount, p, 0
                )
            );
            require(ok, "SFL: Aave flash failed");
        }

        for (uint256 i; i < tokens.length; i++) {
            IERC20(tokens[i]).transfer(BALANCER_VAULT, amounts[i] + feeAmounts[i]);
            emit FlashRepaid("balancer", amounts[i]);
        }

        for (uint256 i; i < tokens.length; i++) {
            uint256 bal = IERC20(tokens[i]).balanceOf(address(this));
            if (bal > 0) IERC20(tokens[i]).transfer(TREASURY, bal);
        }
    }

    function executeOperation(
        address asset, uint256 amount, uint256 premium, address, bytes calldata
    ) external returns (bool) {
        require(msg.sender == AAVE_POOL, "SFL: not aave");
        IERC20(asset).approve(AAVE_POOL, amount + premium);
        emit FlashRepaid("aave", amount);
        return true;
    }

    function emergencySweep(address token) external {
        require(msg.sender == OPERATOR, "SFL: op");
        uint256 b = IERC20(token).balanceOf(address(this));
        if (b > 0) IERC20(token).transfer(TREASURY, b);
    }

    receive() external payable {}
}
