// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PABDToken} from "../src/PABDToken.sol";
import {PrivateSale} from "../src/PrivateSale.sol";
import {Staking} from "../src/Staking.sol";
import {VestingVault} from "../src/Vesting.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";

contract DeployScript is Script {
    function run() external {
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address treasury = vm.envOr("TREASURY_ADDRESS", admin);
        address usdtAddr = vm.envOr("USDT_ADDRESS", address(0));
        uint256 price = vm.envOr("TOKEN_PRICE_USDT", uint256(0.1 ether));
        uint256 minBuy = vm.envOr("MIN_BUY_USDT", uint256(10 ether));
        uint256 maxBuy = vm.envOr("MAX_BUY_USDT", uint256(100_000 ether));
        uint256 saleStart = vm.envOr("SALE_START", block.timestamp);
        uint256 saleEnd = vm.envOr("SALE_END", block.timestamp + 365 days);

        vm.startBroadcast();

        if (usdtAddr == address(0)) {
            MockUSDT usdt = new MockUSDT();
            usdtAddr = address(usdt);
            console2.log("MockUSDT", usdtAddr);
        }

        PABDToken token = new PABDToken(admin, admin);
        // Vesting kept available for future allocations; private sale delivers instantly.
        VestingVault vesting = new VestingVault(admin, address(token));
        Staking staking = new Staking(admin, address(token));
        PrivateSale sale = new PrivateSale(
            admin,
            usdtAddr,
            address(token),
            treasury,
            price,
            minBuy,
            maxBuy,
            saleStart,
            saleEnd
        );

        // Seed sale inventory for instant buyer delivery
        uint256 saleAllocation = 1_000_000_000 ether;
        token.transfer(address(sale), saleAllocation);

        // Seed staking rewards
        uint256 rewardAllocation = 100_000_000 ether;
        token.approve(address(staking), rewardAllocation);
        staking.fundRewards(rewardAllocation);

        vm.stopBroadcast();

        console2.log("PABDToken", address(token));
        console2.log("VestingVault", address(vesting));
        console2.log("Staking", address(staking));
        console2.log("PrivateSale", address(sale));
        console2.log("USDT", usdtAddr);
    }
}
