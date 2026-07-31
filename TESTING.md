# PAB-D Platform Testing Guide

## 1) Enable multi-wallet support (required for Trust Wallet)

1. Create a free project at [Reown Cloud](https://cloud.reown.com)
2. Copy Project ID
3. In `frontend/.env`:

```env
VITE_API_URL=http://127.0.0.1:8000/api
VITE_CHAIN_ID=56
VITE_WC_PROJECT_ID=your_reown_project_id
VITE_EXPLORER_URL=https://bscscan.com
```

4. Restart frontend:

```powershell
cd frontend
npm run dev
```

Without `VITE_WC_PROJECT_ID`, Trust Wallet mobile / WalletConnect QR will not work.

---

## 2) Start services

```powershell
# Terminal 1
cd backend
php artisan serve

# Terminal 2
cd frontend
npm run dev
```

Open: http://localhost:5173

---

## 3) Test checklist

### A. Wallet connect
| Wallet | How to test | Pass? |
|--------|-------------|-------|
| MetaMask (browser) | Connect → MetaMask | Dashboard opens |
| Trust Wallet (browser extension) | Connect → Trust Wallet | Dashboard opens |
| Trust Wallet (mobile) | Connect → Trust Wallet / WalletConnect → scan QR | Dashboard opens |
| Other wallets (TokenPocket, Binance, Rainbow, etc.) | Connect → WalletConnect | Dashboard opens |

**Mobile note:** Phone cannot open `localhost`. Use a public URL (hosting/ngrok) for Trust Wallet QR testing.

### B. Network
- Wrong network → app asks to switch to BNB Smart Chain
- Pass if MetaMask/Trust switches to BSC

### C. Dashboard
- Wallet address shown
- Balances load (BNB/USDT/PAB-D)
- BUY TOKEN / STAKE TOKEN cards visible

### D. Buy flow (needs contract addresses in Admin)
1. Admin → paste USDT + Sale + Token + Vesting addresses → Save
2. Buy → enter USDT (>= min_buy) → Approve USDT → Buy Now
3. MetaMask/Trust confirms tx
4. Success toast + dashboard updates + History shows buy

### E. Stake flow
1. Stake → amount + lock period → Stake Now
2. Wallet confirms
3. Dashboard + History update

### F. Claim / vesting
- Before unlock: claimable = 0
- After unlock schedule: Claim Tokens works

### G. Admin
- Pause/Resume sale
- Change price
- View investors / export

---

## 4) Quick API checks

```text
GET  http://127.0.0.1:8000/api/config
POST http://127.0.0.1:8000/api/wallet-login  {"wallet":"0x..."}
GET  http://127.0.0.1:8000/api/dashboard     (Bearer token)
```

`/api/config` must show non-null `usdt_address` and `sale_address` before buy/stake on-chain tests.

---

## 5) Client demo order

1. Connect MetaMask  
2. Connect Trust Wallet (QR)  
3. Show dashboard  
4. Show Admin settings with live contracts  
5. Do 1 small buy + 1 stake on testnet  
6. Show History + explorer link  
