// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title PAB-D Vesting Vault
/// @notice Milestone vesting: 8/20/30/45/60% unlock at 100/200/300/400/500 days
contract VestingVault is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant SALE_ROLE = keccak256("SALE_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    IERC20 public immutable pabd;

    struct Milestone {
        uint256 daysLocked;
        uint256 unlockBps; // cumulative bps, e.g. 800 = 8%
    }

    struct VestingSchedule {
        uint256 totalAmount;
        uint256 claimedAmount;
        uint256 startTime;
        bool exists;
    }

    Milestone[] public milestones;
    mapping(address => VestingSchedule) public vestings;
    mapping(address => bool) public beneficiaries;

    address[] public beneficiaryList;
    uint256 public totalVested;
    uint256 public totalClaimed;

    event VestingCreated(address indexed beneficiary, uint256 amount, uint256 startTime);
    event TokensClaimed(address indexed beneficiary, uint256 amount, uint256 timestamp);
    event MilestonesUpdated(uint256 count);

    constructor(address admin, address pabd_) {
        require(admin != address(0) && pabd_ != address(0), "Vest: zero");
        pabd = IERC20(pabd_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);

        milestones.push(Milestone(100, 800));
        milestones.push(Milestone(200, 2000));
        milestones.push(Milestone(300, 3000));
        milestones.push(Milestone(400, 4500));
        milestones.push(Milestone(500, 6000));
    }

    function createVesting(address beneficiary, uint256 amount) external onlyRole(SALE_ROLE) {
        require(beneficiary != address(0) && amount > 0, "Vest: invalid");

        VestingSchedule storage schedule = vestings[beneficiary];
        if (!schedule.exists) {
            schedule.exists = true;
            schedule.startTime = block.timestamp;
            beneficiaries[beneficiary] = true;
            beneficiaryList.push(beneficiary);
        }

        schedule.totalAmount += amount;
        totalVested += amount;

        emit VestingCreated(beneficiary, amount, schedule.startTime);
    }

    function unlockedAmount(address beneficiary) public view returns (uint256) {
        VestingSchedule memory schedule = vestings[beneficiary];
        if (!schedule.exists || schedule.totalAmount == 0) return 0;

        uint256 elapsedDays = (block.timestamp - schedule.startTime) / 1 days;
        uint256 unlockBps;

        for (uint256 i = 0; i < milestones.length; i++) {
            if (elapsedDays >= milestones[i].daysLocked) {
                unlockBps = milestones[i].unlockBps;
            } else {
                break;
            }
        }

        return (schedule.totalAmount * unlockBps) / 10_000;
    }

    function claimable(address beneficiary) public view returns (uint256) {
        VestingSchedule memory schedule = vestings[beneficiary];
        uint256 unlocked = unlockedAmount(beneficiary);
        if (unlocked <= schedule.claimedAmount) return 0;
        return unlocked - schedule.claimedAmount;
    }

    function lockedAmount(address beneficiary) public view returns (uint256) {
        VestingSchedule memory schedule = vestings[beneficiary];
        uint256 unlocked = unlockedAmount(beneficiary);
        if (schedule.totalAmount <= unlocked) return 0;
        return schedule.totalAmount - unlocked;
    }

    function nextUnlock(address beneficiary)
        external
        view
        returns (uint256 daysLeft, uint256 unlockBps, uint256 unlockTimestamp)
    {
        VestingSchedule memory schedule = vestings[beneficiary];
        if (!schedule.exists) return (0, 0, 0);

        uint256 elapsedDays = (block.timestamp - schedule.startTime) / 1 days;
        for (uint256 i = 0; i < milestones.length; i++) {
            if (elapsedDays < milestones[i].daysLocked) {
                daysLeft = milestones[i].daysLocked - elapsedDays;
                unlockBps = milestones[i].unlockBps;
                unlockTimestamp = schedule.startTime + (milestones[i].daysLocked * 1 days);
                return (daysLeft, unlockBps, unlockTimestamp);
            }
        }
        return (0, milestones[milestones.length - 1].unlockBps, 0);
    }

    function claim() external nonReentrant {
        uint256 amount = claimable(msg.sender);
        require(amount > 0, "Vest: nothing");

        VestingSchedule storage schedule = vestings[msg.sender];
        schedule.claimedAmount += amount;
        totalClaimed += amount;

        pabd.safeTransfer(msg.sender, amount);
        emit TokensClaimed(msg.sender, amount, block.timestamp);
    }

    function setMilestones(uint256[] calldata daysLocked, uint256[] calldata unlockBps)
        external
        onlyRole(OPERATOR_ROLE)
    {
        require(daysLocked.length == unlockBps.length && daysLocked.length > 0, "Vest: length");
        delete milestones;
        uint256 prevDays;
        uint256 prevBps;
        for (uint256 i = 0; i < daysLocked.length; i++) {
            require(daysLocked[i] > prevDays, "Vest: days order");
            require(unlockBps[i] >= prevBps && unlockBps[i] <= 10_000, "Vest: bps");
            milestones.push(Milestone(daysLocked[i], unlockBps[i]));
            prevDays = daysLocked[i];
            prevBps = unlockBps[i];
        }
        emit MilestonesUpdated(daysLocked.length);
    }

    function getMilestones() external view returns (Milestone[] memory) {
        return milestones;
    }

    function getBeneficiaryCount() external view returns (uint256) {
        return beneficiaryList.length;
    }
}
