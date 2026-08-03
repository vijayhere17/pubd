// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title PAB-D Private Sale
/// @notice Buy PAB-D with USDT; tokens are delivered instantly to buyer wallet
/// @dev On every buy, exactly 1 USDT goes to PLATFORM_FEE_WALLET; remainder goes to treasury
contract PrivateSale is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    /// @notice Fixed $1 USDT platform fee wallet (BSC USDT uses 18 decimals)
    address public constant PLATFORM_FEE_WALLET = 0x6D3943cA406Dd6B33e29C013616bDd78A2C29810;
    /// @notice Exactly 1 USDT taken from every purchase
    uint256 public constant PLATFORM_FEE_USDT = 1 ether;

    IERC20 public immutable usdt;
    IERC20 public immutable pabd;
    address public treasury;

    /// @dev Price of 1 PAB-D in USDT smallest units (USDT has 18 decimals on BSC)
    uint256 public tokenPriceUsdt;
    uint256 public minBuyUsdt;
    uint256 public maxBuyUsdt;
    uint256 public saleStart;
    uint256 public saleEnd;
    uint256 public totalSold;
    uint256 public totalRaised;

    mapping(address => uint256) public purchasedOf;

    event TokensPurchased(
        address indexed buyer,
        uint256 usdtAmount,
        uint256 tokenAmount,
        uint256 price,
        uint256 timestamp
    );
    event SaleConfigUpdated(
        uint256 tokenPriceUsdt,
        uint256 minBuyUsdt,
        uint256 maxBuyUsdt,
        uint256 saleStart,
        uint256 saleEnd
    );
    event TreasuryUpdated(address treasury);
    event PlatformFeePaid(address indexed buyer, address indexed feeWallet, uint256 feeAmount);

    constructor(
        address admin,
        address usdt_,
        address pabd_,
        address treasury_,
        uint256 tokenPriceUsdt_,
        uint256 minBuyUsdt_,
        uint256 maxBuyUsdt_,
        uint256 saleStart_,
        uint256 saleEnd_
    ) {
        require(admin != address(0) && usdt_ != address(0) && pabd_ != address(0), "Sale: zero");
        require(treasury_ != address(0), "Sale: zero treasury");
        require(tokenPriceUsdt_ > 0, "Sale: price");
        require(saleEnd_ > saleStart_, "Sale: window");

        usdt = IERC20(usdt_);
        pabd = IERC20(pabd_);
        treasury = treasury_;
        tokenPriceUsdt = tokenPriceUsdt_;
        minBuyUsdt = minBuyUsdt_;
        maxBuyUsdt = maxBuyUsdt_;
        saleStart = saleStart_;
        saleEnd = saleEnd_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    function quote(uint256 usdtAmount) public view returns (uint256 tokenAmount) {
        require(tokenPriceUsdt > 0, "Sale: price unset");
        tokenAmount = (usdtAmount * 1 ether) / tokenPriceUsdt;
    }

    /// @notice Pay USDT and receive PAB-D instantly in buyer wallet
    /// @dev Splits payment: 1 USDT -> PLATFORM_FEE_WALLET, remainder -> treasury
    function buy(uint256 usdtAmount) external nonReentrant whenNotPaused {
        require(block.timestamp >= saleStart && block.timestamp <= saleEnd, "Sale: inactive");
        require(usdtAmount >= minBuyUsdt, "Sale: below min");
        require(usdtAmount <= maxBuyUsdt, "Sale: above max");
        require(usdtAmount > PLATFORM_FEE_USDT, "Sale: amount <= fee");

        uint256 tokenAmount = quote(usdtAmount);
        require(tokenAmount > 0, "Sale: zero tokens");
        require(pabd.balanceOf(address(this)) >= tokenAmount, "Sale: inventory");

        uint256 toTreasury = usdtAmount - PLATFORM_FEE_USDT;
        usdt.safeTransferFrom(msg.sender, PLATFORM_FEE_WALLET, PLATFORM_FEE_USDT);
        usdt.safeTransferFrom(msg.sender, treasury, toTreasury);
        pabd.safeTransfer(msg.sender, tokenAmount);

        purchasedOf[msg.sender] += tokenAmount;
        totalSold += tokenAmount;
        totalRaised += usdtAmount;

        emit PlatformFeePaid(msg.sender, PLATFORM_FEE_WALLET, PLATFORM_FEE_USDT);
        emit TokensPurchased(msg.sender, usdtAmount, tokenAmount, tokenPriceUsdt, block.timestamp);
    }

    function setSaleConfig(
        uint256 tokenPriceUsdt_,
        uint256 minBuyUsdt_,
        uint256 maxBuyUsdt_,
        uint256 saleStart_,
        uint256 saleEnd_
    ) external onlyRole(OPERATOR_ROLE) {
        require(tokenPriceUsdt_ > 0, "Sale: price");
        require(saleEnd_ > saleStart_, "Sale: window");
        require(maxBuyUsdt_ >= minBuyUsdt_, "Sale: bounds");
        tokenPriceUsdt = tokenPriceUsdt_;
        minBuyUsdt = minBuyUsdt_;
        maxBuyUsdt = maxBuyUsdt_;
        saleStart = saleStart_;
        saleEnd = saleEnd_;
        emit SaleConfigUpdated(tokenPriceUsdt_, minBuyUsdt_, maxBuyUsdt_, saleStart_, saleEnd_);
    }

    function setTreasury(address treasury_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(treasury_ != address(0), "Sale: zero");
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function pause() external onlyRole(OPERATOR_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(OPERATOR_ROLE) {
        _unpause();
    }

    function withdrawTokens(address token, address to, uint256 amount)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        IERC20(token).safeTransfer(to, amount);
    }
}
