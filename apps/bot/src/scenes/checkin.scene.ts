import { Scenes, Markup } from 'telegraf'
import type { SfaContext } from '../bot'
import { formatRupiah, AR_STATUS_EMOJI } from '@sfa/shared'
import {
  getTodayRoute,
  searchCustomers,
  getNearbyCustomers,
  getCustomerARInfo,
  type RouteCustomer
} from '../services/customer.service'
import { createVisit, getLastVisit } from '../services/visit.service'
import { prisma } from '@sfa/db'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildCustomerKeyboard(customers: RouteCustomer[], showDistance = false) {
  return customers.map(c => {
    const distLabel = showDistance && 'distanceM' in c
      ? ` (${Math.round((c as any).distanceM)}m)`
      : ''
    const visitedLabel = c.visitedToday ? ' ✅' : ''
    return [Markup.button.callback(
      `${c.customerName}${visitedLabel}${distLabel}`,
      `cust:${c.customerAcumaticaId}`
    )]
  })
}

function formatLastVisit(date: Date | null): string {
  if (!date) return 'Belum pernah'
  const days = Math.floor((Date.now() - date.getTime()) / 86400000)
  if (days === 0) return 'Hari ini'
  if (days === 1) return 'Kemarin'
  return `${days} hari lalu`
}

// Ditampilkan saat customer dipilih — dipakai oleh stepFindCustomer dan stepConfirmCustomer
async function showCustomerConfirmation(ctx: SfaContext) {
  const customerId = ctx.session.pendingCustomerId
  if (!customerId) { await ctx.scene.leave(); return }

  const ca = await prisma.customerAssignment.findFirst({
    where: { customerAcumaticaId: customerId, salespersonId: ctx.user.id }
  })
  if (!ca) {
    await ctx.reply('Customer tidak ditemukan.')
    return ctx.scene.leave()
  }

  ctx.session.pendingCustomerName = ca.customerName
  ctx.session.pendingCustomerAddress = ca.customerAddress ?? ''
  ctx.session.pendingCustomerPhone = ca.customerPhone ?? ''
  ctx.session.pendingOutOfRoute = false

  await ctx.reply(
    `Konfirmasi kunjungan ke:\n\n🏪 *${ca.customerName}*\n📍 ${ca.customerAddress ?? '-'}\n📞 ${ca.customerPhone ?? '-'}`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Ya, ini tokonya', 'confirm:yes')],
        [Markup.button.callback('❌ Bukan ini', 'confirm:no')]
      ])
    }
  )
}

// Ditampilkan setelah check-in berhasil
async function showCustomerSummary(ctx: SfaContext) {
  const { currentCustomerId, currentCustomerName } = ctx.session
  const now = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })

  const [ar, lastVisit] = await Promise.all([
    getCustomerARInfo(currentCustomerId!),
    getLastVisit(ctx.user.id, currentCustomerId!)
  ])

  const arEmoji = ar ? AR_STATUS_EMOJI[ar.arStatus] : '⚪'
  const arText = ar
    ? `${arEmoji} AR: ${formatRupiah(Number(ar.totalOutstanding))}` +
      (Number(ar.totalOverdue) > 0 ? ` _(overdue ${formatRupiah(Number(ar.totalOverdue))})_` : '')
    : '⚪ AR: Belum ada data'

  const lastVisitText = lastVisit?.checkinAt
    ? `🗓 Kunjungan terakhir: ${formatLastVisit(lastVisit.checkinAt)}`
    : '🗓 Belum pernah dikunjungi'

  await ctx.reply(
    `✅ Check-in berhasil! ${now}\n\n━━━━━━━━━━━━━━━━━━━━\n🏪 *${currentCustomerName}*\n${arText}\n${lastVisitText}\n━━━━━━━━━━━━━━━━━━━━`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🛒 Buat Order Sekarang', 'action:order')],
        [Markup.button.callback('💬 Catat Kunjungan Saja', 'action:log_only')]
      ])
    }
  )
}

// ─── Step 0: Main Menu ────────────────────────────────────────────────────────

async function stepMainMenu(ctx: SfaContext) {
  await ctx.reply(
    'Cari toko yang kamu kunjungi:',
    Markup.inlineKeyboard([
      [Markup.button.callback('📋 Rute Hari Ini', 'mode:route')],
      [Markup.button.callback('📍 Deteksi Lokasi Terdekat', 'mode:gps')],
      [Markup.button.callback('🔍 Cari Nama Toko', 'mode:search')],
      [Markup.button.callback('❌ Batal', 'cancel')]
    ])
  )
  return ctx.wizard.next()
}

// ─── Step 1: Find Customer ────────────────────────────────────────────────────

async function stepFindCustomer(ctx: SfaContext) {
  await ctx.answerCbQuery?.()

  const cb = (ctx.callbackQuery as any)?.data as string | undefined
  const msg = ctx.message as any

  if (cb === 'cancel') {
    await ctx.reply('Kunjungan dibatalkan.', Markup.removeKeyboard())
    return ctx.scene.leave()
  }

  // Customer selected — tampilkan konfirmasi langsung
  if (cb?.startsWith('cust:')) {
    ctx.session.pendingCustomerId = cb.split(':')[1]
    await ctx.wizard.next()
    return showCustomerConfirmation(ctx)
  }

  // Mode selection
  if (cb?.startsWith('mode:')) {
    const mode = cb.split(':')[1] as 'route' | 'gps' | 'search'
    ctx.session.checkinMode = mode

    if (mode === 'route') {
      const routes = await getTodayRoute(ctx.user.id)
      if (routes.length === 0) {
        ctx.session.checkinMode = 'search'
        await ctx.reply('Tidak ada rute hari ini. Cari nama toko:')
        return
      }
      await ctx.reply(
        `Rute hari ini (${routes.length} toko):`,
        Markup.inlineKeyboard([
          ...buildCustomerKeyboard(routes),
          [Markup.button.callback('🔍 Toko Lain (luar rute)', 'mode:search')],
          [Markup.button.callback('❌ Batal', 'cancel')]
        ])
      )
      return
    }

    if (mode === 'gps') {
      await ctx.reply(
        'Bagikan lokasi kamu sekarang:',
        Markup.keyboard([[Markup.button.locationRequest('📍 Bagikan Lokasi')]])
          .oneTime().resize()
      )
      return
    }

    if (mode === 'search') {
      await ctx.reply('Ketik nama toko (minimal 3 huruf):')
      return
    }
  }

  // Location received
  if (msg?.location) {
    await ctx.reply('Mencari toko terdekat...', Markup.removeKeyboard())
    const nearby = await getNearbyCustomers(ctx.user.id, msg.location.latitude, msg.location.longitude)
    if (nearby.length === 0) {
      await ctx.reply(
        'Tidak ada toko terdaftar di sekitarmu. Coba cari manual:',
        Markup.inlineKeyboard([
          [Markup.button.callback('🔍 Cari Nama', 'mode:search')],
          [Markup.button.callback('❌ Batal', 'cancel')]
        ])
      )
      return
    }
    await ctx.reply(
      'Toko terdekat:',
      Markup.inlineKeyboard([
        ...buildCustomerKeyboard(nearby, true),
        [Markup.button.callback('🔍 Cari Nama', 'mode:search')],
        [Markup.button.callback('❌ Batal', 'cancel')]
      ])
    )
    return
  }

  // Text search
  if (msg?.text && !msg.text.startsWith('/')) {
    const query = msg.text.trim()
    if (query.length < 3) { await ctx.reply('Minimal 3 huruf. Coba lagi:'); return }
    const results = await searchCustomers(ctx.user.id, query)
    if (results.length === 0) { await ctx.reply(`Toko "${query}" tidak ditemukan. Coba kata lain:`); return }
    await ctx.reply(
      `Hasil pencarian "${query}":`,
      Markup.inlineKeyboard([
        ...buildCustomerKeyboard(results),
        [Markup.button.callback('🔍 Cari Lain', 'mode:search')],
        [Markup.button.callback('❌ Batal', 'cancel')]
      ])
    )
  }
}

// ─── Step 2: Confirm Customer ─────────────────────────────────────────────────

async function stepConfirmCustomer(ctx: SfaContext) {
  await ctx.answerCbQuery?.()
  const cb = (ctx.callbackQuery as any)?.data as string | undefined

  if (cb === 'cancel') {
    await ctx.reply('Kunjungan dibatalkan.')
    return ctx.scene.leave()
  }

  if (cb === 'confirm:no') {
    ctx.session.pendingCustomerId = undefined
    await ctx.reply(
      'Cari toko lain:',
      Markup.inlineKeyboard([
        [Markup.button.callback('📋 Rute Hari Ini', 'mode:route')],
        [Markup.button.callback('🔍 Cari Nama', 'mode:search')],
        [Markup.button.callback('❌ Batal', 'cancel')]
      ])
    )
    return ctx.wizard.selectStep(1)
  }

  if (cb === 'confirm:yes') {
    const s = ctx.session
    const visit = await createVisit({
      salespersonId: ctx.user.id,
      customerAcumaticaId: s.pendingCustomerId!,
      customerName: s.pendingCustomerName!,
      gpsLat: s.pendingGpsLat,
      gpsLng: s.pendingGpsLng,
      outOfRoute: s.pendingOutOfRoute
    })
    ctx.session.currentVisitId = visit.id
    ctx.session.currentCustomerId = s.pendingCustomerId
    ctx.session.currentCustomerName = s.pendingCustomerName
    await ctx.wizard.next()
    return showCustomerSummary(ctx)
  }

  // First entry — tampilkan konfirmasi (tidak akan masuk sini karena langsung dari showCustomerConfirmation)
  await showCustomerConfirmation(ctx)
}

// ─── Step 3: Customer Summary ─────────────────────────────────────────────────

async function stepCustomerSummary(ctx: SfaContext) {
  await ctx.answerCbQuery?.()
  const cb = (ctx.callbackQuery as any)?.data as string | undefined

  if (cb === 'action:order') {
    await ctx.reply('Memulai order... (Sprint 2)')
    return ctx.scene.leave()
  }

  if (cb === 'action:log_only') {
    await ctx.reply('✅ Kunjungan tercatat!\n\nKetik /menu untuk kunjungi toko berikutnya.')
    return ctx.scene.leave()
  }

  // Fallback jika masuk tanpa callback
  await showCustomerSummary(ctx)
}

// ─── Scene Export ─────────────────────────────────────────────────────────────

export const checkInScene = new Scenes.WizardScene(
  'CHECKIN',
  stepMainMenu,
  stepFindCustomer,
  stepConfirmCustomer,
  stepCustomerSummary
) as unknown as Scenes.WizardScene<SfaContext>
