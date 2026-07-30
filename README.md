# PAB-D Decentralized Application

Production-ready PAB-D private sale, staking, and vesting DApp on BNB Smart Chain.

## Stack

- **Frontend:** React + Vite + Tailwind CSS + Ethers.js + MetaMask / WalletConnect
- **Backend:** Laravel 12 API + Sanctum + MySQL
- **Contracts:** Solidity 0.8.24 + OpenZeppelin + Foundry

## Project layout

```
backend/     Laravel API
frontend/    React SPA (preserves original landing page)
contracts/   PABDToken, PrivateSale, Staking, VestingVault
index.html   Original landing page source
```

## User flow

1. Open landing page (`/`) — original PAB-D design
2. Click **Connect** → MetaMask / WalletConnect
3. Switch to BNB Smart Chain if needed
4. Wallet login creates/fetches user in Laravel
5. Redirect to `/dashboard`
6. Buy with USDT, stake, claim vested tokens
7. View `/history` or manage `/admin`

## Quick start

### 1. Database

```bash
mysql -e "CREATE DATABASE pabd; CREATE USER 'pabd'@'localhost' IDENTIFIED BY 'pabd_secret'; GRANT ALL ON pabd.* TO 'pabd'@'localhost';"
```

### 2. Backend

```bash
cd backend
cp .env.example .env   # or use existing .env
composer install
php artisan key:generate
php artisan migrate --seed
php artisan serve --host=127.0.0.1 --port=8000
```

Default seeded admin wallet: `0x1111111111111111111111111111111111111111` (set `is_admin` on your wallet in DB for admin UI).

### 3. Contracts

```bash
cd contracts
forge install foundry-rs/forge-std
forge install OpenZeppelin/openzeppelin-contracts
# or: ./install.sh
forge build
forge test
# Deploy (example)
export ADMIN_ADDRESS=0xYourAdmin
forge script script/Deploy.s.sol --rpc-url $BSC_RPC_URL --broadcast --verify
```

Copy deployed addresses into Admin → Settings (USDT, token, sale, staking, vesting, treasury).

### 4. Frontend

```bash
cd frontend
npm install
# Set VITE_WC_PROJECT_ID from https://cloud.reown.com for WalletConnect QR
npm run dev
```

Open http://localhost:5173

## API highlights

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/config` | public | Sale/token config |
| POST | `/api/auth/nonce` | public | SIWE nonce |
| POST | `/api/wallet-login` | public | Wallet auth |
| GET | `/api/dashboard` | sanctum | Portfolio + vesting |
| POST | `/api/transactions/buy` | sanctum | Persist buy tx |
| POST | `/api/transactions/stake` | sanctum | Persist stake tx |
| POST | `/api/transactions/claim` | sanctum | Persist claim tx |
| GET | `/api/transactions/history` | sanctum | History tabs |
| * | `/api/admin/*` | sanctum+admin | Settings, investors, export |

## Vesting schedule (default)

| Days | Unlock |
|------|--------|
| 100 | 8% |
| 200 | 20% |
| 300 | 30% |
| 400 | 45% |
| 500 | 60% |

## Security notes

- Duplicate `tx_hash` rejected in Laravel
- Wallet ownership via personal_sign (SIWE-style) when available
- Contracts use ReentrancyGuard, AccessControl, Pausable
- Sale can be paused from admin or on-chain operator role

## Environment

Frontend `.env`:

```
VITE_API_URL=http://127.0.0.1:8000/api
VITE_CHAIN_ID=56
VITE_WC_PROJECT_ID=your_walletconnect_project_id
VITE_EXPLORER_URL=https://bscscan.com
```
