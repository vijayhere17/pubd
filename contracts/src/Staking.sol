// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title PAB-D Staking
/// @notice Lock PAB-D for fixed periods and earn APY rewards
contract Staking is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    IERC20 public immutable pabd;

    struct LockPeriod {
        uint256 daysLocked;
        uint256 apyBps; // basis points, 1200 = 12%
        bool active;
    }

    struct StakeInfo {
        uint256 amount;
        uint256 lockDays;
        uint256 apyBps;
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
        uint256 apyBps,
        uint256 endTime
    );
    event Unstaked(address indexed user, uint256 indexed stakeId, uint256 amount, uint256 rewards);
    event RewardsClaimed(address indexed user, uint256 indexed stakeId, uint256 rewards);
    event LockPeriodUpdated(uint256 daysLocked, uint256 apyBps, bool active);
    event RewardsFunded(uint256 amount);

    constructor(address admin, address pabd_) {
        require(admin != address(0) && pabd_ != address(0), "Stake: zero");
        pabd = IERC20(pabd_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);

        _setLockPeriod(100, 800, true);
        _setLockPeriod(200, 1000, true);
        _setLockPeriod(300, 1200, true);
        _setLockPeriod(400, 1500, true);
        _setLockPeriod(500, 1800, true);
    }

    function stake(uint256 amount, uint256 lockDays) external nonReentrant whenNotPaused {
        require(amount > 0, "Stake: amount");
        LockPeriod memory period = lockPeriods[lockDays];
        require(period.active, "Stake: period");

        pabd.safeTransferFrom(msg.sender, address(this), amount);

        uint256 stakeId = nextStakeId++;
        uint256 endTime = block.timestamp + (lockDays * 1 days);

        stakes[stakeId] = StakeInfo({
            amount: amount,
            lockDays: lockDays,
            apyBps: period.apyBps,
            startTime: block.timestamp,
            endTime: endTime,
            claimedRewards: 0,
            active: true
        });

        userStakeIds[msg.sender].push(stakeId);
        totalStakedOf[msg.sender] += amount;
        totalStaked += amount;

        emit Staked(msg.sender, stakeId, amount, lockDays, period.apyBps, endTime);
    }

    function pendingRewards(uint256 stakeId) public view returns (uint256) {
        StakeInfo memory info = stakes[stakeId];
        if (!info.active || info.amount == 0) return 0;

        uint256 elapsed = block.timestamp > info.endTime
            ? info.endTime - info.startTime
            : block.timestamp - info.startTime;

        uint256 gross = (info.amount * info.apyBps * elapsed) / (10_000 * 365 days);
        if (gross <= info.claimedRewards) return 0;
        return gross - info.claimedRewards;
    }

    function claimRewards(uint256 stakeId) external nonReentrant whenNotPaused {
        StakeInfo storage info = stakes[stakeId];
        require(info.active, "Stake: inactive");
        require(_ownsStake(msg.sender, stakeId), "Stake: not owner");

        uint256 rewards = pendingRewards(stakeId);
        require(rewards > 0, "Stake: no rewards");
        require(rewardReserve >= rewards, "Stake: reserve");

        info.claimedRewards += rewards;
        rewardReserve -= rewards;
        pabd.safeTransfer(msg.sender, rewards);

        emit RewardsClaimed(msg.sender, stakeId, rewards);
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

    function setLockPeriod(uint256 daysLocked, uint256 apyBps, bool active)
        external
        onlyRole(OPERATOR_ROLE)
    {
        _setLockPeriod(daysLocked, apyBps, active);
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

    function _setLockPeriod(uint256 daysLocked, uint256 apyBps, bool active) internal {
        require(daysLocked > 0, "Stake: days");
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
        lockPeriods[daysLocked] = LockPeriod(daysLocked, apyBps, active);
        emit LockPeriodUpdated(daysLocked, apyBps, active);
    }

    function _ownsStake(address user, uint256 stakeId) internal view returns (bool) {
        uint256[] storage ids = userStakeIds[user];
        for (uint256 i = 0; i < ids.length; i++) {
            if (ids[i] == stakeId) return true;
        }
        return false;
    }
}
