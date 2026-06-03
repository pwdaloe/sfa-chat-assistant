import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ── Ganti dengan Telegram ID kamu dari @userinfobot ──────────────────────────
const YOUR_TELEGRAM_ID = BigInt(process.env.SEED_TELEGRAM_ID ?? '0')
const SPV_TELEGRAM_ID  = BigInt(process.env.SEED_SPV_TELEGRAM_ID ?? '0')

async function main() {
  if (YOUR_TELEGRAM_ID === 0n || SPV_TELEGRAM_ID === 0n) {
    console.error('Set SEED_TELEGRAM_ID dan SEED_SPV_TELEGRAM_ID di .env sebelum seed.')
    console.error('Cara dapat: Kirim pesan ke @userinfobot di Telegram')
    process.exit(1)
  }

  // ── Users ──────────────────────────────────────────────────────────────────
  const supervisor = await prisma.user.upsert({
    where: { telegramId: SPV_TELEGRAM_ID },
    update: { isActive: true, role: 'SUPERVISOR' },
    create: {
      telegramId: SPV_TELEGRAM_ID,
      fullName: 'Ahmad Fauzi (Supervisor)',
      role: 'SUPERVISOR',
      isActive: true
    }
  })

  const salesperson = await prisma.user.upsert({
    where: { telegramId: YOUR_TELEGRAM_ID },
    update: { isActive: true, role: 'SALESPERSON', supervisorId: supervisor.id },
    create: {
      telegramId: YOUR_TELEGRAM_ID,
      fullName: 'Budi Santoso (Sales)',
      role: 'SALESPERSON',
      supervisorId: supervisor.id,
      isActive: true
    }
  })

  console.log(`✅ Users: ${salesperson.fullName}, ${supervisor.fullName}`)

  // ── Customer Assignments ───────────────────────────────────────────────────
  const customers = [
    { id: 'CUST-001', name: 'Toko Makmur Jaya',    address: 'Jl. Anggrek No. 12', phone: '0812-0001-0001', lat: -6.2900, lng: 106.8450 },
    { id: 'CUST-002', name: 'Toko Sumber Rejeki',  address: 'Jl. Kenanga No. 5',  phone: '0812-0001-0002', lat: -6.2910, lng: 106.8460 },
    { id: 'CUST-003', name: 'Toko Budi Luhur',     address: 'Jl. Melati No. 8',   phone: '0812-0001-0003', lat: -6.2920, lng: 106.8470 },
    { id: 'CUST-004', name: 'Toko Harapan Baru',   address: 'Jl. Mawar No. 3',    phone: '0812-0001-0004', lat: -6.2930, lng: 106.8480 },
    { id: 'CUST-005', name: 'Toko Maju Bersama',   address: 'Jl. Dahlia No. 15',  phone: '0812-0001-0005', lat: -6.2940, lng: 106.8490 },
    { id: 'CUST-006', name: 'Toko Abadi Jaya',     address: 'Jl. Flamboyan No. 2',phone: '0812-0001-0006', lat: -6.2850, lng: 106.8420 },
    { id: 'CUST-007', name: 'Toko Sejahtera Maju', address: 'Jl. Kamboja No. 7',  phone: '0812-0001-0007', lat: -6.2860, lng: 106.8430 },
    { id: 'CUST-008', name: 'Toko Berkah Utama',   address: 'Jl. Teratai No. 9',  phone: '0812-0001-0008', lat: -6.2870, lng: 106.8440 }
  ]

  const assignments: { id: string; acuId: string }[] = []
  for (const c of customers) {
    const ca = await prisma.customerAssignment.upsert({
      where: { customerAcumaticaId_salespersonId: { customerAcumaticaId: c.id, salespersonId: salesperson.id } },
      update: { customerName: c.name, customerAddress: c.address, customerPhone: c.phone, gpsLat: c.lat, gpsLng: c.lng },
      create: {
        customerAcumaticaId: c.id,
        customerName: c.name,
        customerAddress: c.address,
        customerPhone: c.phone,
        gpsLat: c.lat,
        gpsLng: c.lng,
        salespersonId: salesperson.id,
        isActive: true
      }
    })
    assignments.push({ id: ca.id, acuId: c.id })
  }
  console.log(`✅ Customer assignments: ${assignments.length} toko`)

  // ── Routes (Senin=1 & Rabu=3: CUST-001 s/d 005, Selasa=2 & Kamis=4: CUST-006 s/d 008) ──
  const routeData = [
    { acuId: 'CUST-001', days: [1, 3], seq: 1 },
    { acuId: 'CUST-002', days: [1, 3], seq: 2 },
    { acuId: 'CUST-003', days: [1, 3], seq: 3 },
    { acuId: 'CUST-004', days: [1, 3], seq: 4 },
    { acuId: 'CUST-005', days: [1, 3], seq: 5 },
    { acuId: 'CUST-006', days: [2, 4], seq: 1 },
    { acuId: 'CUST-007', days: [2, 4], seq: 2 },
    { acuId: 'CUST-008', days: [2, 4], seq: 3 }
  ]

  for (const r of routeData) {
    const ca = assignments.find(a => a.acuId === r.acuId)!
    for (const day of r.days) {
      await prisma.route.upsert({
        where: { salespersonId_customerAssignmentId_dayOfWeek: {
          salespersonId: salesperson.id,
          customerAssignmentId: ca.id,
          dayOfWeek: day
        }},
        update: { visitSequence: r.seq },
        create: {
          salespersonId: salesperson.id,
          customerAssignmentId: ca.id,
          dayOfWeek: day,
          visitSequence: r.seq
        }
      })
    }
  }
  console.log('✅ Routes created')

  // ── Products (test data) ───────────────────────────────────────────────────
  const products = [
    { skuId: 'MIE-GORENG-SOTO-85',  skuName: 'Mie Goreng Soto 85gr',   category: 'Mie Instant' },
    { skuId: 'MIE-GORENG-AYAM-85',  skuName: 'Mie Goreng Ayam 85gr',   category: 'Mie Instant' },
    { skuId: 'MIE-KUAH-AYAM-85',    skuName: 'Mie Kuah Ayam 85gr',     category: 'Mie Instant' },
    { skuId: 'SARDEN-KALENG-155',   skuName: 'Sarden Kaleng 155gr',     category: 'Sarden/Kornet' },
    { skuId: 'TEH-BOTOL-250',       skuName: 'Teh Botol 250ml',         category: 'Minuman' },
    { skuId: 'SNACK-BISKUIT-100',   skuName: 'Biskuit Kaleng 100gr',    category: 'Snack/Biskuit' }
  ]
  for (const p of products) {
    await prisma.product.upsert({
      where: { skuId: p.skuId },
      update: {},
      create: { ...p, isActive: true, syncedAt: new Date() }
    })
  }
  console.log(`✅ Products: ${products.length} SKU`)

  // ── Pricelist cache (harga per customer) ──────────────────────────────────
  const basePrices: Record<string, number> = {
    'MIE-GORENG-SOTO-85': 95000, 'MIE-GORENG-AYAM-85': 93000,
    'MIE-KUAH-AYAM-85': 90000,  'SARDEN-KALENG-155': 180000,
    'TEH-BOTOL-250': 52000,      'SNACK-BISKUIT-100': 78000
  }
  for (const c of customers) {
    for (const [skuId, price] of Object.entries(basePrices)) {
      const product = products.find(p => p.skuId === skuId)!
      await prisma.pricelistCache.upsert({
        where: { customerAcumaticaId_skuId: { customerAcumaticaId: c.id, skuId } },
        update: { unitPrice: price },
        create: {
          customerAcumaticaId: c.id,
          skuId,
          skuName: product.skuName,
          unitPrice: price,
          uom: 'KARTON',
          syncedAt: new Date()
        }
      })
    }
  }
  console.log('✅ Pricelist cache seeded')

  console.log('\n🎉 Seed selesai! Sekarang kamu bisa test check-in di bot.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
