// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PABDToken} from "../src/PABDToken.sol";
import {PrivateSale} from "../src/PrivateSale.sol";
import {Staking} from "../src/Staking.sol";
import {VestingVault} from "../src/Vesting.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";

contract PABDTest is Test {
    PABDToken token;
    PrivateSale sale;
    Staking staking;
    VestingVault vesting;
    MockUSDT usdt;

    address admin = address(0xA11CE);
    address buyer = address(0xB0B);
    address treasury = address(0x71Ea5);

    function setUp() public {
        vm.startPrank(admin);
        usdt = new MockUSDT();
        token = new PABDToken(admin, admin);
        vesting = new VestingVault(admin, address(token));
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
        token.approve(address(staking), 1_000_000 ether);
        staking.fundRewards(1_000_000 ether);
        usdt.transfer(buyer, 10_000 ether);
        vm.stopPrank();
    }

    function testBuySendsTokensInstantlyToWallet() public {
        uint256 beforeBal = token.balanceOf(buyer);

        vm.startPrank(buyer);
        usdt.approve(address(sale), 100 ether);
        sale.buy(100 ether);
        vm.stopPrank();

        // 100 USDT / 0.10 = 1000 PAB-D instantly in wallet
        assertEq(sale.purchasedOf(buyer), 1000 ether);
        assertEq(token.balanceOf(buyer), beforeBal + 1000 ether);
    }

    function testBuyThenStake() public {
        vm.startPrank(buyer);
        usdt.approve(address(sale), 100 ether);
        sale.buy(100 ether); // receive 1000 PAB-D

        token.approve(address(staking), 1000 ether);
        staking.stake(1000 ether, 100);
        assertEq(staking.totalStakedOf(buyer), 1000 ether);
        assertEq(token.balanceOf(buyer), 0);

        vm.warp(block.timestamp + 100 days);
        staking.unstake(1);
        assertEq(staking.totalStakedOf(buyer), 0);
        assertGt(token.balanceOf(buyer), 1000 ether); // principal + rewards
        vm.stopPrank();
    }

    function testQuote() public view {
        assertEq(sale.quote(10 ether), 100 ether);
    }
}
