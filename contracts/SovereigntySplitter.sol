// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// SovereigntySplitter -- 100% profit to treasury
// Zero deductions. Zero fees. Zero splits.

interface IERC20 {
    function transfer(address,uint256) external returns(bool);
    function balanceOf(address) external view returns(uint256);
}

contract SovereigntySplitter {
    address public immutable OPERATOR;
    address public immutable TREASURY;

    mapping(address => bool) public authorized;

    uint256 public totalRouted;
    uint256 public routeCount;

    event Routed(address indexed token, uint256 amount);

    modifier onlyAuth() {
        require(authorized[msg.sender] || msg.sender == OPERATOR, "SSPL: auth");
        _;
    }
    modifier onlyOperator() { require(msg.sender == OPERATOR, "SSPL: op"); _; }

    constructor(address _op, address _treasury) {
        OPERATOR  = _op;
        TREASURY  = _treasury;
        authorized[_op] = true;
    }

    function route(address token) external onlyAuth returns (uint256 amount) {
        amount = IERC20(token).balanceOf(address(this));
        if (amount == 0) return 0;
        IERC20(token).transfer(TREASURY, amount);
        totalRouted += amount;
        routeCount++;
        emit Routed(token, amount);
    }

    function routeAll(address[] calldata tokens) external onlyAuth {
        for (uint256 i; i < tokens.length; i++) {
            uint256 bal = IERC20(tokens[i]).balanceOf(address(this));
            if (bal > 0) {
                IERC20(tokens[i]).transfer(TREASURY, bal);
                totalRouted += bal;
                routeCount++;
                emit Routed(tokens[i], bal);
            }
        }
    }

    function authorize(address addr, bool auth) external onlyOperator {
        authorized[addr] = auth;
    }

    function emergencySweep(address token) external onlyOperator {
        uint256 b = IERC20(token).balanceOf(address(this));
        if (b > 0) IERC20(token).transfer(TREASURY, b);
    }

    receive() external payable {}
}
