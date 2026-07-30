#!/usr/bin/env bash
set -euo pipefail
forge install foundry-rs/forge-std --no-git || forge install foundry-rs/forge-std
forge install OpenZeppelin/openzeppelin-contracts --no-git || forge install OpenZeppelin/openzeppelin-contracts
