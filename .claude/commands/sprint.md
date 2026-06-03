Kamu adalah sprint executor untuk project SFA Chat Assistant.

Project ini adalah Telegram bot berbasis guided flow untuk salesperson/canvasser Indonesia, terintegrasi dengan Acumatica ERP via scheduled API.

## Sprint Definitions

**Sprint 0 — Foundation**
- Monorepo structure (pnpm workspaces)
- Docker Compose: PostgreSQL + Redis
- Telegram bot skeleton + webhook
- User registration & role assignment (/start)
- Acumatica adapter: READ ONLY (customer, pricelist, AR, stock)

**Sprint 1 — Route & Check-in**
- Customer master sync → mapping backend
- Route assignment per salesperson
- Check-in flow: GPS detection + manual search
- Tampil customer info: last order, AR status dari cache

**Sprint 2 — Order Entry**
- Product catalog + category/SKU guided flow
- Pricelist cache per customer (read Acumatica)
- Cart management: add, edit, remove item
- Order confirmation → staging DB (status: CONFIRMED)

**Sprint 3 — Supervisor Daily Recap**
- Scheduled digest: pagi 08:00, siang 13:00, sore 17:30
- Real-time team activity dashboard (on-demand)
- Per-salesperson breakdown
- Alert otomatis: sales tidak aktif, pending approvals

**Sprint 4 — Simplified Approval**
- Flag order dengan discount request
- Notifikasi real-time ke supervisor
- Approve / Reject only (no counter, no auto-expire untuk MVP)
- Update order status di staging DB

**Sprint 5 — Hardening & UAT**
- Error handling & edge cases
- Load test ratusan user
- Pilot 5-10 salesperson

## Tech Stack
- Bot: Telegraf v4 + TypeScript (Scenes untuk state machine)
- API: Fastify + TypeScript
- DB: PostgreSQL + Prisma ORM
- Cache/Session: Redis
- Queue/Scheduler: BullMQ
- ERP: IERPAdapter pattern (AcumaticaAdapter implements IERPAdapter)

## Best Practices (selalu ingat)
1. Pakai Telegraf Scenes — jangan bikin state machine manual
2. Session state di Redis — bukan in-memory
3. Semua write ke Acumatica pakai idempotency key (order.id sebagai ExternalRef)
4. Acumatica calls: baca dari cache dulu, jangan real-time per user action
5. ERP Adapter interface — bot/API tidak boleh import langsung dari acumatica adapter
6. Upsert bukan insert untuk semua sync jobs
7. Structured logging dengan pino

## Instruksi Eksekusi

Sprint yang akan dikerjakan: **$ARGUMENTS**

Lakukan langkah berikut:
1. Gunakan TodoWrite untuk breakdown tasks sprint ini
2. Implementasikan setiap task satu per satu, tandai completed setelah selesai
3. Untuk setiap file baru: buat struktur direktori dulu jika belum ada
4. Setelah semua task selesai: tampilkan summary apa yang sudah dibuat dan apa next step
