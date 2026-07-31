// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title PAB-D Staking
/// @notice Stake PAB-D for fixed periods and earn a flat bonus unlocked at maturity
/// @dev 100d=8%, 200d=20%, 300d=30%, 400d=45%, 500d=60%
contract Staking is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    IERC20 public immutable pabd;

    struct LockPeriod {
        uint256 daysLocked;
        uint256 rewardBps; // 800 = 8%
        bool active;
    }

    struct StakeInfo {
        uint256 amount;
        uint256 lockDays;
        uint256 rewardBps;
        uint256 startTime;
        uint256 endTime;
        uint256 claimedRewards;
        bool active;
    }

    uint256 public nextStakeId = 1;
    mapping(uint256 => LockPeriod) public lockPeriods;
    uint256[] public lockPeriodDays;
    mapping(uint256 => StakeInfo) public stakes;
    mapping(address => uint256[]) public userStakeIds;
    mapping(address => uint256) public totalStakedOf;

    uint256 public totalStaked;
    uint256 public rewardReserve;

    event Staked(
        address indexed user,
        uint256 indexed stakeId,
        uint256 amount,
        uint256 lockDays,
        uint256 rewardBps,
        uint256 endTime,
        uint256 estimatedTotal
    );
    event Unstaked(address indexed user, uint256 indexed stakeId, uint256 amount, uint256 rewards);
    event LockPeriodUpdated(uint256 daysLocked, uint256 rewardBps, bool active);
    event RewardsFunded(uint256 amount);

    constructor(address admin, address pabd_) {
        require(admin != address(0) && pabd_ != address(0), "Stake: zero");
        pabd = IERC20(pabd_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);

        _setLockPeriod(100, 800, true);   // 8%
        _setLockPeriod(200, 2000, true);  // 20%
        _setLockPeriod(300, 3000, true);  // 30%
        _setLockPeriod(400, 4500, true);  // 45%
        _setLockPeriod(500, 6000, true);  // 60%
    }

    function stake(uint256 amount, uint256 lockDays) external nonReentrant whenNotPaused {
        require(amount > 0, "Stake: amount");
        LockPeriod memory period = lockPeriods[lockDays];
        require(period.active, "Stake: period");

        uint256 reward = (amount * period.rewardBps) / 10_000;
        require(rewardReserve >= reward, "Stake: reserve");

        pabd.safeTransferFrom(msg.sender, address(this), amount);

        uint256 stakeId = nextStakeId++;
        uint256 endTime = block.timestamp + (lockDays * 1 days);

        stakes[stakeId] = StakeInfo({
            amount: amount,
            lockDays: lockDays,
            rewardBps: period.rewardBps,
            startTime: block.timestamp,
            endTime: endTime,
            claimedRewards: 0,
            active: true
        });

        userStakeIds[msg.sender].push(stakeId);
        totalStakedOf[msg.sender] += amount;
        totalStaked += amount;

        emit Staked(
            msg.sender,
            stakeId,
            amount,
            lockDays,
            period.rewardBps,
            endTime,
            amount + reward
        );
    }

    function estimatedReward(uint256 amount, uint256 lockDays) external view returns (uint256) {
        LockPeriod memory period = lockPeriods[lockDays];
        if (!period.active || amount == 0) return 0;
        return (amount * period.rewardBps) / 10_000;
    }

    function pendingRewards(uint256 stakeId) public view returns (uint256) {
        StakeInfo memory info = stakes[stakeId];
        if (!info.active || info.amount == 0) return 0;
        if (block.timestamp < info.endTime) return 0; // claimable only after lock ends
        uint256 reward = (info.amount * info.rewardBps) / 10_000;
        if (reward <= info.claimedRewards) return 0;
        return reward - info.claimedRewards;
    }

    function previewTotal(uint256 stakeId) external view returns (uint256 principal, uint256 reward, uint256 total, bool claimable) {
        StakeInfo memory info = stakes[stakeId];
        principal = info.amount;
        reward = (info.amount * info.rewardBps) / 10_000;
        total = principal + reward;
        claimable = info.active && block.timestamp >= info.endTime;
    }

    function unstake(uint256 stakeId) external nonReentrant whenNotPaused {
        StakeInfo storage info = stakes[stakeId];
        require(info.active, "Stake: inactive");
        require(_ownsStake(msg.sender, stakeId), "Stake: not owner");
        require(block.timestamp >= info.endTime, "Stake: locked");

        uint256 rewards = pendingRewards(stakeId);
        uint256 principal = info.amount;

        info.active = false;
        totalStakedOf[msg.sender] -= principal;
        totalStaked -= principal;

        if (rewards > 0) {
            require(rewardReserve >= rewards, "Stake: reserve");
            info.claimedRewards += rewards;
            rewardReserve -= rewards;
            pabd.safeTransfer(msg.sender, principal + rewards);
        } else {
            pabd.safeTransfer(msg.sender, principal);
        }

        emit Unstaked(msg.sender, stakeId, principal, rewards);
    }

    function fundRewards(uint256 amount) external onlyRole(OPERATOR_ROLE) {
        pabd.safeTransferFrom(msg.sender, address(this), amount);
        rewardReserve += amount;
        emit RewardsFunded(amount);
    }

    function setLockPeriod(uint256 daysLocked, uint256 rewardBps, bool active)
        external
        onlyRole(OPERATOR_ROLE)
    {
        _setLockPeriod(daysLocked, rewardBps, active);
    }

    function pause() external onlyRole(OPERATOR_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(OPERATOR_ROLE) {
        _unpause();
    }

    function getUserStakeIds(address user) external view returns (uint256[] memory) {
        return userStakeIds[user];
    }

    function getLockPeriodDays() external view returns (uint256[] memory) {
        return lockPeriodDays;
    }

    function _setLockPeriod(uint256 daysLocked, uint256 rewardBps, bool active) internal {
        require(daysLocked > 0, "Stake: days");
        require(rewardBps <= 10_000, "Stake: bps");
        if (!lockPeriods[daysLocked].active && active) {
            bool exists;
            for (uint256 i = 0; i < lockPeriodDays.length; i++) {
                if (lockPeriodDays[i] == daysLocked) {
                    exists = true;
                    break;
                }
            }
            if (!exists) lockPeriodDays.push(daysLocked);
        }
        lockPeriods[daysLocked] = LockPeriod(daysLocked, rewardBps, active);
        emit LockPeriodUpdated(daysLocked, rewardBps, active);
    }

    function _ownsStake(address user, uint256 stakeId) internal view returns (bool) {
        uint256[] storage ids = userStakeIds[user];
        for (uint256 i = 0; i < ids.length; i++) {
            if (ids[i] == stakeId) return true;
        }
        return false;
    }
}
