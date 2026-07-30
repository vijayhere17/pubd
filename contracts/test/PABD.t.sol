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
            address(vesting),
            0.1 ether,
            10 ether,
            100_000 ether,
            block.timestamp,
            block.timestamp + 30 days
        );
        vesting.grantRole(vesting.SALE_ROLE(), address(sale));
        token.transfer(address(sale), 10_000_000 ether);
        token.approve(address(staking), 1_000_000 ether);
        staking.fundRewards(1_000_000 ether);
        usdt.transfer(buyer, 10_000 ether);
        token.transfer(buyer, 50_000 ether);
        vm.stopPrank();
    }

    function testBuyAndVestClaim() public {
        vm.startPrank(buyer);
        usdt.approve(address(sale), 100 ether);
        sale.buy(100 ether);
        vm.stopPrank();

        assertEq(sale.purchasedOf(buyer), 1000 ether);
        assertEq(vesting.claimable(buyer), 0);

        vm.warp(block.timestamp + 100 days);
        assertEq(vesting.claimable(buyer), 80 ether); // 8%

        vm.prank(buyer);
        vesting.claim();
        assertEq(token.balanceOf(buyer), 50_000 ether + 80 ether);
    }

    function testStakeAndUnstake() public {
        vm.startPrank(buyer);
        token.approve(address(staking), 1000 ether);
        staking.stake(1000 ether, 100);
        uint256 stakeId = 1;
        assertEq(staking.totalStakedOf(buyer), 1000 ether);

        vm.warp(block.timestamp + 100 days);
        staking.unstake(stakeId);
        assertEq(staking.totalStakedOf(buyer), 0);
        vm.stopPrank();
    }

    function testQuote() public view {
        assertEq(sale.quote(10 ether), 100 ether);
    }
}
