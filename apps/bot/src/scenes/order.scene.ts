import { Scenes, Markup } from 'telegraf'
import type { SfaContext } from '../bot'
import { formatRupiah } from '@sfa/shared'
import type { CartItem } from '@sfa/shared'
import {
  getCategories,
  getProductsByCategory,
  getPriceForCustomer,
  getPricelistForCustomer
} from '../services/product.service'
import { createConfirmedOrder, calcCartTotal } from '../services/order.service'

// ─── UI Helpers ───────────────────────────────────────────────────────────────

async function showCategories(ctx: SfaContext): Promise<void> {
  ctx.session.orderPhase = 'CATEGORY'
  const categories = await getCategories()
  const cart = ctx.session.cart ?? []

  const categoryButtons = categories.map(cat =>
    [Markup.button.callback(cat, `cat:${cat}`)]
  )
  const bottomButtons = cart.length > 0
    ? [
        [Markup.button.callback(`🛒 Review Cart (${cart.length} item)`, 'order:review_cart')],
        [Markup.button.callback('❌ Batalkan Order', 'order:cancel')]
      ]
    : [[Markup.button.callback('❌ Batalkan Order', 'order:cancel')]]

  await ctx.reply(
    cart.length > 0 ? 'Tambah produk lagi:' : 'Pilih kategori produk:',
    Markup.inlineKeyboard([...categoryButtons, ...bottomButtons])
  )
}

async function showSKUs(ctx: SfaContext, category: string): Promise<void> {
  ctx.session.orderPhase = 'SKU'
  ctx.session.pendingCategory = category

  const [products, pricelist] = await Promise.all([
    getProductsByCategory(category),
    getPricelistForCustomer(ctx.session.currentCustomerId!)
  ])

  const cart = ctx.session.cart ?? []
  const skuButtons = products.map(p => {
    const price = pricelist[p.skuId]
    const inCart = cart.some(i => i.skuId === p.skuId) ? ' ✅' : ''
    const priceLabel = price ? ` — ${formatRupiah(price)}` : ''
    return [Markup.button.callback(
      `${p.skuName}${inCart}${priceLabel}`,
      `sku:${p.skuId}:${p.skuName}`
    )]
  })

  await ctx.reply(
    `Pilih produk — ${category}:`,
    Markup.inlineKeyboard([
      ...skuButtons,
      [Markup.button.callback('← Kembali ke Kategori', 'order:back_category')]
    ])
  )
}

async function showQtyKeyboard(ctx: SfaContext, skuId: string, skuName: string): Promise<void> {
  ctx.session.orderPhase = 'QTY'
  ctx.session.pendingSkuId = skuId
  ctx.session.pendingSkuName = skuName

  const price = await getPriceForCustomer(ctx.session.currentCustomerId!, skuId)
  const priceText = price ? `${formatRupiah(price)}/karton` : 'Harga tidak tersedia'

  await ctx.reply(
    `📦 *${skuName}*\n💰 ${priceText}\n\nMasukkan jumlah (karton):`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('1', 'qty:1'),
          Markup.button.callback('2', 'qty:2'),
          Markup.button.callback('3', 'qty:3'),
          Markup.button.callback('5', 'qty:5')
        ],
        [
          Markup.button.callback('10', 'qty:10'),
          Markup.button.callback('12', 'qty:12'),
          Markup.button.callback('24', 'qty:24'),
          Markup.button.callback('✏️ Manual', 'qty:manual')
        ],
        [Markup.button.callback('← Ganti Produk', 'order:back_sku')]
      ])
    }
  )
}

async function showCartReview(ctx: SfaContext): Promise<void> {
  ctx.session.orderPhase = 'CART'
  const cart = ctx.session.cart ?? []

  if (cart.length === 0) {
    await ctx.reply('Cart kosong. Pilih produk dulu.')
    return showCategories(ctx)
  }

  const lines = cart.map((item, i) =>
    `${i + 1}. ${item.skuName}\n   ${item.qty} karton × ${formatRupiah(item.unitPrice)} = ${formatRupiah(item.unitPrice * item.qty)}`
  )
  const total = calcCartTotal(cart)
  const removeButtons = cart.map(item =>
    [Markup.button.callback(`🗑 Hapus: ${item.skuName}`, `remove:${item.skuId}`)]
  )

  await ctx.reply(
    `━━━━━━━━━━━━━━━━━━━━\n🛒 CART — ${ctx.session.currentCustomerName}\n━━━━━━━━━━━━━━━━━━━━\n` +
    lines.join('\n\n') +
    `\n━━━━━━━━━━━━━━━━━━━━\nTOTAL: ${formatRupiah(total)}\n━━━━━━━━━━━━━━━━━━━━`,
    Markup.inlineKeyboard([
      [Markup.button.callback('➕ Tambah Produk', 'order:add_more')],
      ...removeButtons,
      [Markup.button.callback('✅ Konfirmasi Order', 'order:confirm')],
      [Markup.button.callback('❌ Batalkan', 'order:cancel')]
    ])
  )
}

async function addToCart(ctx: SfaContext, qty: number): Promise<void> {
  const { pendingSkuId, pendingSkuName, currentCustomerId } = ctx.session
  if (!pendingSkuId || !pendingSkuName) return showCategories(ctx)

  const price = (await getPriceForCustomer(currentCustomerId!, pendingSkuId)) ?? 0
  const cart = ctx.session.cart ?? []
  const existing = cart.findIndex(i => i.skuId === pendingSkuId)

  if (existing >= 0) {
    cart[existing].qty = qty
  } else {
    cart.push({ skuId: pendingSkuId, skuName: pendingSkuName, qty, unitPrice: price, discountPct: 0 })
  }
  ctx.session.cart = cart
  ctx.session.orderPhase = 'CATEGORY'

  await ctx.reply(
    `✅ *${pendingSkuName}* × ${qty} karton ditambahkan.\nTotal cart: ${cart.length} item — ${formatRupiah(calcCartTotal(cart))}`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('➕ Tambah Produk Lagi', 'order:add_more')],
        [Markup.button.callback(`🛒 Review & Konfirmasi`, 'order:review_cart')]
      ])
    }
  )
}

async function confirmOrder(ctx: SfaContext): Promise<void> {
  const cart = ctx.session.cart ?? []
  if (cart.length === 0) { await ctx.reply('Cart kosong.'); return ctx.scene.leave() }

  const order = await createConfirmedOrder(ctx.session.currentVisitId!, cart)
  ctx.session.cart = []
  ctx.session.orderPhase = undefined

  const ref = `ORD-${order.id.slice(0, 8).toUpperCase()}`
  await ctx.reply(
    `✅ *ORDER DIKONFIRMASI!*\n\n📋 Ref: \`${ref}\`\n🏪 ${ctx.session.currentCustomerName}\n📦 ${cart.length} item\n💰 Total: ${formatRupiah(calcCartTotal(cart))}\n\nOrder akan diproses ke sistem.\nKetik /menu untuk lanjutkan aktivitas.`,
    { parse_mode: 'Markdown' }
  )
  return ctx.scene.leave()
}

// ─── Single Step Handler ───────────────────────────────────────────────────────

async function stepOrderMain(ctx: SfaContext): Promise<void> {
  if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {})

  const cb  = (ctx.callbackQuery as any)?.data as string | undefined
  const msg = (ctx.message as any)?.text as string | undefined

  // ── Cancel ──────────────────────────────────────────────────────────────────
  if (cb === 'order:cancel') {
    ctx.session.cart = []
    ctx.session.orderPhase = undefined
    await ctx.reply('Order dibatalkan.')
    return ctx.scene.leave()
  }

  // ── Category selected ────────────────────────────────────────────────────────
  if (cb?.startsWith('cat:')) {
    return showSKUs(ctx, cb.slice(4))
  }

  // ── Back to categories ───────────────────────────────────────────────────────
  if (cb === 'order:back_category') {
    return showCategories(ctx)
  }

  // ── SKU selected ─────────────────────────────────────────────────────────────
  if (cb?.startsWith('sku:')) {
    const parts = cb.split(':')
    const skuId = parts[1]
    const skuName = parts.slice(2).join(':')
    return showQtyKeyboard(ctx, skuId, skuName)
  }

  // ── Back to SKUs ─────────────────────────────────────────────────────────────
  if (cb === 'order:back_sku') {
    if (ctx.session.pendingCategory) return showSKUs(ctx, ctx.session.pendingCategory)
    return showCategories(ctx)
  }

  // ── Qty preset ───────────────────────────────────────────────────────────────
  if (cb?.startsWith('qty:')) {
    const q = cb.slice(4)
    if (q === 'manual') {
      ctx.session.orderPhase = 'AWAITING_MANUAL_QTY'
      await ctx.reply('Ketik jumlah karton:')
      return
    }
    return addToCart(ctx, parseInt(q))
  }

  // ── Manual qty text ──────────────────────────────────────────────────────────
  if (msg && /^\d+$/.test(msg.trim()) && ctx.session.orderPhase === 'AWAITING_MANUAL_QTY') {
    const qty = parseInt(msg.trim())
    if (qty <= 0 || qty > 9999) { await ctx.reply('Jumlah tidak valid (1–9999):'); return }
    return addToCart(ctx, qty)
  }

  // ── Review cart ──────────────────────────────────────────────────────────────
  if (cb === 'order:review_cart' || cb === 'order:add_more') {
    if (cb === 'order:review_cart') return showCartReview(ctx)
    return showCategories(ctx)
  }

  // ── Remove item ──────────────────────────────────────────────────────────────
  if (cb?.startsWith('remove:')) {
    ctx.session.cart = (ctx.session.cart ?? []).filter(i => i.skuId !== cb.slice(7))
    return showCartReview(ctx)
  }

  // ── Confirm order ─────────────────────────────────────────────────────────────
  if (cb === 'order:confirm') {
    return confirmOrder(ctx)
  }

  // ── Default: tampilkan kategori ───────────────────────────────────────────────
  return showCategories(ctx)
}

// ─── Scene Export ─────────────────────────────────────────────────────────────

export const orderScene = new Scenes.WizardScene(
  'ORDER',
  stepOrderMain
) as unknown as Scenes.WizardScene<SfaContext>

;(orderScene as any).command('menu', async (ctx: SfaContext) => {
  ctx.session.cart = []
  ctx.session.orderPhase = undefined
  await ctx.scene.leave()
  await ctx.reply('Order dibatalkan. Ketik /menu untuk kembali ke menu utama.')
})
;(orderScene as any).command('cancel', async (ctx: SfaContext) => {
  ctx.session.cart = []
  ctx.session.orderPhase = undefined
  await ctx.scene.leave()
  await ctx.reply('Order dibatalkan.')
})
