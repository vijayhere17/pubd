// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PABDToken} from "../src/PABDToken.sol";
import {PrivateSale} from "../src/PrivateSale.sol";
import {Staking} from "../src/Staking.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";

contract PABDTest is Test {
    PABDToken token;
    PrivateSale sale;
    Staking staking;
    MockUSDT usdt;

    address admin = address(0xA11CE);
    address buyer = address(0xB0B);
    address treasury = address(0x71Ea5);

    function setUp() public {
        vm.startPrank(admin);
        usdt = new MockUSDT();
        token = new PABDToken(admin, admin);
        staking = new Staking(admin, address(token));
        sale = new PrivateSale(
            admin,
            address(usdt),
            address(token),
            treasury,
            0.1 ether,
            10 ether,
            100_000 ether,
            block.timestamp,
            block.timestamp + 30 days
        );
        token.transfer(address(sale), 10_000_000 ether);
        token.approve(address(staking), 5_000_000 ether);
        staking.fundRewards(5_000_000 ether);
        usdt.transfer(buyer, 10_000 ether);
        vm.stopPrank();
    }

    function testBuySendsTokensInstantlyToWallet() public {
        uint256 beforeBal = token.balanceOf(buyer);
        uint256 feeBefore = usdt.balanceOf(sale.PLATFORM_FEE_WALLET());
        uint256 treasuryBefore = usdt.balanceOf(treasury);

        vm.startPrank(buyer);
        usdt.approve(address(sale), 100 ether);
        sale.buy(100 ether);
        vm.stopPrank();

        assertEq(sale.purchasedOf(buyer), 1000 ether);
        assertEq(token.balanceOf(buyer), beforeBal + 1000 ether);
        // $1 platform fee, remainder to treasury
        assertEq(usdt.balanceOf(sale.PLATFORM_FEE_WALLET()), feeBefore + 1 ether);
        assertEq(usdt.balanceOf(treasury), treasuryBefore + 99 ether);
    }

    function testBuySplitsOneDollarFeeOnLargePurchase() public {
        address fee = sale.PLATFORM_FEE_WALLET();
        uint256 feeBefore = usdt.balanceOf(fee);
        uint256 treasuryBefore = usdt.balanceOf(treasury);

        vm.startPrank(buyer);
        usdt.approve(address(sale), 500 ether);
        sale.buy(500 ether); // $500 buy
        vm.stopPrank();

        assertEq(usdt.balanceOf(fee), feeBefore + 1 ether);
        assertEq(usdt.balanceOf(treasury), treasuryBefore + 499 ether);
        assertEq(token.balanceOf(buyer), 5000 ether);
    }

    function testStakeFlatBonusClaimAfterLock() public {
        // Min stake is 5000 PAB-D => buy 500 USDT at $0.10
        vm.startPrank(buyer);
        usdt.approve(address(sale), 500 ether);
        sale.buy(500 ether); // 5000 PAB-D

        token.approve(address(staking), 5000 ether);
        staking.stake(5000 ether, 100);

        (uint256 principal, uint256 reward, uint256 total, bool claimable) = staking.previewTotal(1);
        assertEq(principal, 5000 ether);
        assertEq(reward, 400 ether); // 8% of 5000
        assertEq(total, 5400 ether);
        assertEq(claimable, false);
        assertEq(staking.pendingRewards(1), 0);

        vm.expectRevert("Stake: locked");
        staking.unstake(1);

        vm.warp(block.timestamp + 100 days);
        assertEq(staking.pendingRewards(1), 400 ether);

        staking.unstake(1);
        assertEq(token.balanceOf(buyer), 5400 ether);
        vm.stopPrank();
    }

    function testStakeMovesPabdFromUserToStakingNotAdmin() public {
        vm.startPrank(buyer);
        usdt.approve(address(sale), 500 ether);
        sale.buy(500 ether); // 5000 PAB-D

        uint256 userBefore = token.balanceOf(buyer);
        uint256 stakingBefore = token.balanceOf(address(staking));
        uint256 adminBefore = token.balanceOf(admin);

        token.approve(address(staking), 5000 ether);
        staking.stake(5000 ether, 100);
        vm.stopPrank();

        assertEq(token.balanceOf(buyer), userBefore - 5000 ether, "user PAB-D must decrease");
        assertEq(token.balanceOf(address(staking)), stakingBefore + 5000 ether, "staking contract holds principal");
        assertEq(token.balanceOf(admin), adminBefore, "admin wallet must NOT receive stake principal");
        assertEq(staking.totalStakedOf(buyer), 5000 ether);
    }

    function testStakeRejectsWhenRewardReserveEmpty() public {
        // Fresh staking with zero reserve
        Staking empty = new Staking(admin, address(token));
        vm.startPrank(buyer);
        usdt.approve(address(sale), 500 ether);
        sale.buy(500 ether);
        token.approve(address(empty), 5000 ether);
        vm.expectRevert("Stake: reserve");
        empty.stake(5000 ether, 100);
        vm.stopPrank();
    }

    function testAdminWithdrawAllPabd() public {
        vm.startPrank(buyer);
        usdt.approve(address(sale), 500 ether);
        sale.buy(500 ether);
        token.approve(address(staking), 5000 ether);
        staking.stake(5000 ether, 100);
        vm.stopPrank();

        uint256 stakingBal = token.balanceOf(address(staking));
        assertGt(stakingBal, 0);
        uint256 adminBefore = token.balanceOf(admin);

        vm.prank(admin);
        staking.withdrawAllPabd(admin);

        assertEq(token.balanceOf(address(staking)), 0);
        assertEq(staking.rewardReserve(), 0);
        assertEq(token.balanceOf(admin), adminBefore + stakingBal);
    }

    function testAdminWithdrawTokensPartial() public {
        uint256 reserveBefore = staking.rewardReserve();
        assertGt(reserveBefore, 1000 ether);

        uint256 adminBefore = token.balanceOf(admin);
        vm.prank(admin);
        staking.withdrawTokens(address(token), admin, 1000 ether);

        assertEq(token.balanceOf(admin), adminBefore + 1000 ether);
        assertEq(staking.rewardReserve(), reserveBefore - 1000 ether);
    }

    function testNonAdminCannotWithdrawAll() public {
        vm.prank(buyer);
        vm.expectRevert();
        staking.withdrawAllPabd(buyer);
    }

    function testStakeRejectsBelowMinimum() public {
        vm.startPrank(buyer);
        usdt.approve(address(sale), 100 ether);
        sale.buy(100 ether); // 1000 PAB-D < 5000 min
        token.approve(address(staking), 1000 ether);
        vm.expectRevert("Stake: min 5000");
        staking.stake(1000 ether, 100);
        vm.stopPrank();
    }

    function testQuote() public view {
        assertEq(sale.quote(10 ether), 100 ether);
    }
}
