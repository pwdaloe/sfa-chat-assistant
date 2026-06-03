import { Scenes, Markup } from 'telegraf'
import type { SfaContext } from '../bot'
import { formatRupiah } from '@sfa/shared'
import type { CartItem } from '@sfa/shared'
import { getCategories, getProductsByCategory, getPriceForCustomer } from '../services/product.service'
import { createConfirmedOrder, calcCartTotal } from '../services/order.service'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cartSummaryText(cart: CartItem[], customerName: string): string {
  const lines = cart.map((item, i) =>
    `${i + 1}. ${item.skuName}\n   ${item.qty} karton × ${formatRupiah(item.unitPrice)} = ${formatRupiah(item.unitPrice * item.qty)}`
  )
  const total = calcCartTotal(cart)
  return (
    `━━━━━━━━━━━━━━━━━━━━\n🛒 CART — ${customerName}\n━━━━━━━━━━━━━━━━━━━━\n` +
    lines.join('\n\n') +
    `\n━━━━━━━━━━━━━━━━━━━━\nTOTAL: ${formatRupiah(total)}\n━━━━━━━━━━━━━━━━━━━━`
  )
}

function cartHasItem(cart: CartItem[], skuId: string): boolean {
  return cart.some(i => i.skuId === skuId)
}

// ─── Step 0: Category Menu ────────────────────────────────────────────────────

async function stepCategory(ctx: SfaContext): Promise<void> {
  if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {})
  const cb = (ctx.callbackQuery as any)?.data as string | undefined

  if (cb === 'order:cancel') {
    await ctx.reply('Order dibatalkan. Kunjungan tetap tercatat.')
    return ctx.scene.leave()
  }

  if (cb === 'order:review_cart') {
    await ctx.wizard.selectStep(3)
    return showCartReview(ctx)
  }

  // Re-enter step 0 setelah tambah item — tampilkan kategori
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
    cart.length > 0
      ? `Pilih kategori untuk tambah produk lagi:`
      : `Pilih kategori produk:`,
    Markup.inlineKeyboard([...categoryButtons, ...bottomButtons])
  )

  // Bila tiba dari step lain, tetap di step 0
  if (ctx.wizard.cursor !== 0) {
    ctx.wizard.selectStep(0)
  }
}

// ─── Step 1: SKU Selection ────────────────────────────────────────────────────

async function stepSKU(ctx: SfaContext) {
  if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {})
  const cb = (ctx.callbackQuery as any)?.data as string | undefined

  if (cb === 'order:back_category') {
    ctx.wizard.selectStep(0)
    return stepCategory(ctx)
  }

  if (cb?.startsWith('cat:')) {
    const category = cb.slice(4)
    ctx.session.pendingCategory = category

    const products = await getProductsByCategory(category)
    const customerId = ctx.session.currentCustomerId!
    const pricelist = await import('../services/product.service')
      .then(m => m.getPricelistForCustomer(customerId))

    const cart = ctx.session.cart ?? []
    const skuButtons = products.map(p => {
      const price = pricelist[p.skuId]
      const inCart = cartHasItem(cart, p.skuId) ? ' ✅' : ''
      const priceLabel = price ? ` — ${formatRupiah(price)}` : ''
      return [Markup.button.callback(`${p.skuName}${inCart}${priceLabel}`, `sku:${p.skuId}:${p.skuName}`)]
    })

    await ctx.reply(
      `Pilih produk — ${category}:`,
      Markup.inlineKeyboard([
        ...skuButtons,
        [Markup.button.callback('← Kembali ke Kategori', 'order:back_category')]
      ])
    )
    return ctx.wizard.next()
  }

  // Fallback
  ctx.wizard.selectStep(0)
  return stepCategory(ctx)
}

// ─── Step 2: Quantity Input ───────────────────────────────────────────────────

async function stepQty(ctx: SfaContext) {
  if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {})
  const cb = (ctx.callbackQuery as any)?.data as string | undefined

  if (cb === 'order:back_sku') {
    // Simulasi kembali ke step 1 dengan kategori yang sama
    ctx.wizard.selectStep(1)
    return stepSKU({ ...ctx, callbackQuery: { data: `cat:${ctx.session.pendingCategory}` } as any } as any)
  }

  // SKU dipilih — tampilkan qty keyboard
  if (cb?.startsWith('sku:')) {
    const [, skuId, ...nameParts] = cb.split(':')
    const skuName = nameParts.join(':')
    ctx.session.pendingSkuId = skuId
    ctx.session.pendingSkuName = skuName

    const price = await getPriceForCustomer(ctx.session.currentCustomerId!, skuId)
    const priceText = price ? formatRupiah(price) + '/karton' : 'Harga tidak tersedia'

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
    return ctx.wizard.next()
  }

  // Fallback
  ctx.wizard.selectStep(0)
  return stepCategory(ctx)
}

// ─── Step 3: Cart Review ──────────────────────────────────────────────────────

async function stepCartReview(ctx: SfaContext) {
  if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {})
  const cb = (ctx.callbackQuery as any)?.data as string | undefined
  const msg = ctx.message as any

  // ── Qty received (callback) ────────────────────────────────────────────────
  if (cb?.startsWith('qty:')) {
    const qtyStr = cb.slice(4)

    if (qtyStr === 'manual') {
      await ctx.reply('Ketik jumlah karton:')
      return
    }

    return addToCartAndContinue(ctx, parseInt(qtyStr))
  }

  // ── Qty received (text input) ──────────────────────────────────────────────
  if (msg?.text && /^\d+$/.test(msg.text.trim())) {
    const qty = parseInt(msg.text.trim())
    if (qty <= 0 || qty > 9999) {
      await ctx.reply('Jumlah tidak valid. Masukkan angka 1–9999:')
      return
    }
    return addToCartAndContinue(ctx, qty)
  }

  // ── Remove item ────────────────────────────────────────────────────────────
  if (cb?.startsWith('remove:')) {
    const skuId = cb.slice(7)
    ctx.session.cart = (ctx.session.cart ?? []).filter(i => i.skuId !== skuId)
    if ((ctx.session.cart ?? []).length === 0) {
      await ctx.reply('Cart kosong. Pilih produk dulu.')
      ctx.wizard.selectStep(0)
      return stepCategory(ctx)
    }
    return showCartReview(ctx)
  }

  // ── Tambah produk lagi ─────────────────────────────────────────────────────
  if (cb === 'order:add_more') {
    ctx.wizard.selectStep(0)
    return stepCategory(ctx)
  }

  // ── Konfirmasi order ───────────────────────────────────────────────────────
  if (cb === 'order:confirm') {
    const cart = ctx.session.cart ?? []
    if (cart.length === 0) {
      await ctx.reply('Cart kosong.')
      return ctx.scene.leave()
    }

    const order = await createConfirmedOrder(ctx.session.currentVisitId!, cart)
    ctx.session.cart = []

    const total = calcCartTotal(cart)
    const ref = `ORD-${order.id.slice(0, 8).toUpperCase()}`

    await ctx.reply(
      `✅ *ORDER DIKONFIRMASI!*\n\n` +
      `📋 Ref: \`${ref}\`\n` +
      `🏪 ${ctx.session.currentCustomerName}\n` +
      `📦 ${cart.length} item\n` +
      `💰 Total: ${formatRupiah(total)}\n\n` +
      `Order akan diproses ke sistem.\nKetik /menu untuk lanjutkan aktivitas.`,
      { parse_mode: 'Markdown' }
    )
    return ctx.scene.leave()
  }

  if (cb === 'order:cancel') {
    ctx.session.cart = []
    await ctx.reply('Order dibatalkan.')
    return ctx.scene.leave()
  }

  // Default: tampilkan cart review
  await showCartReview(ctx)
}

// ─── Helpers internal ─────────────────────────────────────────────────────────

async function addToCartAndContinue(ctx: SfaContext, qty: number) {
  const { pendingSkuId, pendingSkuName, currentCustomerId } = ctx.session
  if (!pendingSkuId || !pendingSkuName) {
    ctx.wizard.selectStep(0)
    return stepCategory(ctx)
  }

  const price = await getPriceForCustomer(currentCustomerId!, pendingSkuId) ?? 0
  const cart = ctx.session.cart ?? []

  // Update jika sudah ada, tambah baru jika belum
  const existing = cart.findIndex(i => i.skuId === pendingSkuId)
  if (existing >= 0) {
    cart[existing].qty = qty
  } else {
    cart.push({ skuId: pendingSkuId, skuName: pendingSkuName, qty, unitPrice: price, discountPct: 0 })
  }
  ctx.session.cart = cart

  await ctx.reply(
    `✅ *${pendingSkuName}* × ${qty} karton ditambahkan.\n\n` +
    `Total cart: ${cart.length} item — ${formatRupiah(calcCartTotal(cart))}`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('➕ Tambah Produk Lagi', 'order:add_more')],
        [Markup.button.callback(`🛒 Review & Konfirmasi`, 'order:review_cart')]
      ])
    }
  )
}

async function showCartReview(ctx: SfaContext): Promise<void> {
  const cart = ctx.session.cart ?? []
  if (cart.length === 0) {
    await ctx.reply('Cart kosong.')
    ctx.wizard.selectStep(0)
    return stepCategory(ctx)
  }

  const removeButtons = cart.map(item =>
    [Markup.button.callback(`🗑 Hapus: ${item.skuName}`, `remove:${item.skuId}`)]
  )

  await ctx.reply(
    cartSummaryText(cart, ctx.session.currentCustomerName ?? ''),
    Markup.inlineKeyboard([
      [Markup.button.callback('➕ Tambah Produk', 'order:add_more')],
      ...removeButtons,
      [Markup.button.callback('✅ Konfirmasi Order', 'order:confirm')],
      [Markup.button.callback('❌ Batalkan', 'order:cancel')]
    ])
  )
}

// ─── Scene Export ─────────────────────────────────────────────────────────────

export const orderScene = new Scenes.WizardScene(
  'ORDER',
  stepCategory,
  stepSKU,
  stepQty,
  stepCartReview
) as unknown as Scenes.WizardScene<SfaContext>

;(orderScene as any).command('menu', async (ctx: SfaContext) => {
  ctx.session.cart = []
  await ctx.scene.leave()
  await ctx.reply('Order dibatalkan. Ketik /menu untuk kembali ke menu utama.')
})
;(orderScene as any).command('cancel', async (ctx: SfaContext) => {
  ctx.session.cart = []
  await ctx.scene.leave()
  await ctx.reply('Order dibatalkan.')
})
