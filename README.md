# SFA Chat Assistant

Telegram bot berbasis guided flow untuk salesperson & canvasser di Indonesia, terintegrasi dengan Acumatica ERP via scheduled API.

## Latar Belakang

Salesperson general trade (warung/toko kelontong) biasanya mencatat order di kertas atau notes HP, lalu admin yang input ke ERP — menyebabkan delay fulfillment, rawan salah ketik, dan tidak ada visibility real-time.

Solusi ini memungkinkan salesperson input order langsung dari Telegram dengan guided flow, data tersimpan ke staging DB, dan secara terjadwal di-sync ke Acumatica Sales Order.

## Tech Stack

| Layer | Teknologi |
|---|---|
| Bot | Telegraf v4 + TypeScript (Scenes) |
| API | Fastify + TypeScript |
| Database | PostgreSQL + Prisma ORM |
| Cache / Session | Redis |
| Scheduler / Queue | BullMQ |
| Monorepo | pnpm workspaces |

## Struktur Project

```
sfa-chat-assistant/
├── apps/
│   ├── bot/          # Telegram bot (Telegraf + Scenes)
│   └── api/          # Fastify webhook server
├── packages/
│   ├── db/           # Prisma schema + migrations + seed
│   ├── erp-adapter/  # IERPAdapter interface + AcumaticaAdapter
│   └── shared/       # Types & utilities bersama
├── jobs/             # BullMQ scheduled jobs
└── docker-compose.yml
```

## Role

| Role | Kemampuan |
|---|---|
| `SALESPERSON` | Check-in, buat order, lihat progress harian |
| `SUPERVISOR` | + Approve diskon, edit order, lihat rekap tim |
| `BACKOFFICE` | + Kelola user, monitor semua order |

## Setup Development

### Prerequisites
- Node.js ≥ 20
- pnpm ≥ 9
- Docker Desktop

### 1. Clone & install

```bash
git clone <repo-url>
cd sfa-chat-assistant
pnpm install
```

### 2. Environment

```bash
cp .env.example .env
```

Edit `.env` — wajib diisi:

| Variable | Keterangan |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `DB_PASSWORD` | Password PostgreSQL (sama dengan di DATABASE_URL) |
| `REDIS_PASSWORD` | Password Redis |
| `BOT_TOKEN` | Token dari [@BotFather](https://t.me/BotFather) |
| `ACUMATICA_*` | Kredensial Acumatica (boleh dummy untuk dev) |
| `SEED_TELEGRAM_ID` | Telegram ID untuk seed data salesperson |
| `SEED_SPV_TELEGRAM_ID` | Telegram ID untuk seed data supervisor |

> Telegram ID bisa didapat dari [@userinfobot](https://t.me/userinfobot)

### 3. Jalankan infrastruktur

```bash
docker-compose up -d
```

> Jika port 5432/6379 sudah terpakai, ubah port di `docker-compose.yml` dan sesuaikan di `.env`.

### 4. Setup database

```bash
pnpm db:generate    # generate Prisma client
pnpm db:migrate     # buat tabel
pnpm --filter @sfa/db seed   # isi test data
```

### 5. Jalankan bot

```bash
pnpm dev:bot
```

Buka Telegram → kirim `/start` ke bot → `/menu` → **🏪 Mulai Kunjungan**

## Sprint Progress

| Sprint | Fokus | Status |
|---|---|---|
| **0** | Foundation: monorepo, Docker, bot skeleton, ERP adapter | ✅ Done |
| **1** | Route & Check-in flow (GPS + manual + rute harian) | ✅ Done |
| **2** | Order Entry (guided flow, cart, staging DB) | 🔜 Next |
| **3** | Supervisor Daily Recap (digest 3x/hari) | 🔜 |
| **4** | Simplified Approval (Approve/Reject diskon) | 🔜 |
| **5** | Hardening & UAT | 🔜 |

## Arsitektur ERP Adapter

Semua integrasi ERP melalui interface, bukan implementasi langsung:

```typescript
// Bot/API hanya import interface
import type { IERPAdapter } from '@sfa/erp-adapter'

// Implementasi bisa diganti tanpa ubah bot
class AcumaticaAdapter implements IERPAdapter { ... }
class OtherERPAdapter implements IERPAdapter { ... }
```

## Scheduled Jobs

| Job | Interval | Keterangan |
|---|---|---|
| `sync:ar` | Tiap 2 jam | Sync AR outstanding dari Acumatica |
| `sync:pricelist` | Tiap 6 jam | Sync harga per customer |
| `sync:products` | Tiap 12 jam | Sync katalog produk |
| `sync:customers` | Tiap 24 jam | Update info customer |
| `notify:supervisor-*` | 08:00 / 13:00 / 17:30 | Digest harian ke supervisor |

## Perintah Umum

```bash
pnpm dev:bot          # Jalankan bot (polling mode)
pnpm dev:api          # Jalankan API server
pnpm db:migrate       # Jalankan migrasi database
pnpm db:studio        # Buka Prisma Studio (GUI database)
pnpm typecheck        # Cek TypeScript di semua package
```

## Aktivasi User Baru

User yang `/start` pertama kali akan berstatus **inactive**. Aktivasi via bot (back-office):

```
/admin
→ Pending Users → lihat Telegram ID
→ ketik: aktifkan [TelegramID] SALESPERSON
```

## Catatan Keamanan

- File `.env` **tidak boleh** di-commit ke repository
- Semua credential disimpan di `.env` yang di-exclude oleh `.gitignore`
- Token Telegram dan password database harus diganti sebelum production
