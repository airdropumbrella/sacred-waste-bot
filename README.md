# Sacred Waste Bot 🔥

Automation bot for [Sacred Waste](https://app.sacredwaste.io) — runs daily burn & vote tasks across multiple wallets.

**Features:**
- 🔥 Burn REKT tokens via direct contract call (random 1–7 per tx)
- 🗳️ Hot or Not voting (up to 20 votes/day per wallet)
- 👛 Multi-wallet support with per-wallet proxy
- ⏰ Daily scheduler with cron
- 🔁 Auto-retry & RPC fallback

---

## 📁 Project Structure

```
sacred-waste-bot/
├── src/
│   ├── index.js              # Entry point — run this
│   ├── scheduler.js          # Daily cron scheduler
│   ├── config/
│   │   ├── config.js         # Loads config from .env
│   │   └── abis.js           # Contract ABIs
│   ├── modules/
│   │   ├── burnBot.js        # Burn logic
│   │   ├── voteBot.js        # Voting logic
│   │   └── walletRunner.js   # Orchestrator per wallet
│   └── utils/
│       ├── logger.js
│       ├── helpers.js
│       ├── walletManager.js
│       ├── proxyManager.js
│       └── dailyCache.js
├── scripts/
│   └── inspectContract.js    # Debug: cek wallet & contract
├── .env.example              # Template konfigurasi
└── package.json
```

---

## ⚙️ Prerequisites

- **Node.js >= 18** → [nodejs.org](https://nodejs.org)
- Wallet dengan:
  - ETH di Base (untuk gas)
  - REKT token di Base (untuk di-burn)

---

## 🚀 Instalasi

### 1. Clone repository

```bash
git clone https://github.com/USERNAME/sacred-waste-bot.git
cd sacred-waste-bot
```

### 2. Install dependencies

```bash
npm install
```

### 3. Buat file konfigurasi

```bash
cp .env.example .env
```

Buka `.env` dan isi:

```env
# Wallet kamu (tambah PK_2, PK_3, dst untuk multi-wallet)
PK_1=0x_your_private_key_here
PROXY_1=                        # opsional: http://user:pass@host:port
SW_TOKEN_1=                     # JWT untuk voting (lihat cara dapat di bawah)
```

### 4. Cara dapat SW_TOKEN (untuk voting)

SW_TOKEN diperlukan agar bot bisa melakukan voting.

1. Buka https://app.sacredwaste.io di browser
2. Connect wallet kamu
3. Buka **DevTools** → tab **Console**
4. Ketik perintah ini lalu Enter:
   ```
   localStorage.getItem('sw_token')
   ```
5. Copy hasilnya (`eyJhbGci...`) ke `.env`:
   ```env
   SW_TOKEN_1=eyJhbGci...
   ```

> Token berlaku **7–30 hari**. Ulangi langkah ini jika voting berhenti bekerja.

---

## ▶️ Menjalankan Bot

### Run sekali (burn + vote sekarang)

```bash
npm start
```

### Run terjadwal otomatis setiap hari

```bash
npm run schedule
```

Default jadwal: **09:00 setiap hari**  
Ubah di `.env`: `CRON_SCHEDULE=0 9 * * *`

---

## 🔄 Auto-run 24/7 dengan PM2

```bash
# Install PM2
npm install -g pm2

# Jalankan scheduler
pm2 start "npm run schedule" --name sacred-waste-bot

# Auto-start saat server reboot
pm2 startup
pm2 save

# Cek status
pm2 status

# Lihat log live
pm2 logs sacred-waste-bot
```

---

## 📋 Konfigurasi Lengkap

| Variable | Default | Keterangan |
|---|---|---|
| `PK_N` | wajib | Private key wallet ke-N |
| `PROXY_N` | kosong | Proxy untuk wallet ke-N |
| `SW_TOKEN_N` | kosong | JWT voting untuk wallet ke-N |
| `RPC_URL` | `https://mainnet.base.org` | Base RPC endpoint |
| `ENABLE_BURN` | `true` | Aktifkan burn |
| `BURN_COUNT` | `10` | Jumlah burn per hari per wallet |
| `BURN_AMOUNT_MAX` | `7` | Maksimal token per tx (random 1–N) |
| `BURN_DELAY_MIN` | `30000` | Jeda minimum antar burn (ms) |
| `BURN_DELAY_MAX` | `120000` | Jeda maksimum antar burn (ms) |
| `ENABLE_VOTE` | `true` | Aktifkan voting |
| `VOTE_COUNT` | `20` | Jumlah vote per hari per wallet |
| `SHUFFLE_WALLETS` | `true` | Acak urutan wallet tiap run |
| `BASESCAN_API_KEY` | kosong | API key BaseScan (opsional, untuk rate limit lebih tinggi) |

---

## 📊 Log

Log otomatis tersimpan di folder `logs/` setiap hari.

```bash
# Lihat log hari ini (Linux/Mac)
tail -f logs/bot-$(date +%Y-%m-%d).log
```

---

## 🔒 Keamanan

- Private key **hanya** disimpan di `.env` — tidak pernah hardcoded
- File `.env` sudah ada di `.gitignore` — tidak akan ter-commit ke Git
- **Jangan pernah share file `.env` kamu ke siapapun**

---

## ⚠️ Catatan

- Pastikan wallet punya cukup **ETH** di Base untuk gas fee
- Pastikan wallet punya cukup **REKT token** (minimum 1 per burn tx)
- Jika voting gagal 401, berarti `SW_TOKEN` sudah expired — perbarui sesuai langkah di atas
- Bot otomatis skip wallet yang sudah mencapai daily limit

---

## 📌 Credits

Created by **Bores**  
Telegram: [@AirdropUmbrellaX](https://t.me/AirdropUmbrellaX)