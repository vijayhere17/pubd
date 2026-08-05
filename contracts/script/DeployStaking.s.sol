// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Staking} from "../src/Staking.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Deploy Staking for an existing PAB-D token and optionally fund rewards.
/// @dev Example:
///   ADMIN_ADDRESS=0x... PABD_TOKEN=0xb521... REWARD_AMOUNT=100000ether \
///   forge script script/DeployStaking.s.sol:DeployStakingScript --rpc-url $BSC_RPC_URL --broadcast
contract DeployStakingScript is Script {
    function run() external {
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address pabd = vm.envAddress("PABD_TOKEN");
        uint256 rewardAmount = vm.envOr("REWARD_AMOUNT", uint256(0));

        vm.startBroadcast();
        Staking staking = new Staking(admin, pabd);
        console2.log("Staking", address(staking));
        console2.log("pabd", pabd);
        console2.log("admin", admin);

        if (rewardAmount > 0) {
            IERC20(pabd).approve(address(staking), rewardAmount);
            staking.fundRewards(rewardAmount);
            console2.log("rewardReserve funded", rewardAmount);
        }
        vm.stopBroadcast();
    }
}
