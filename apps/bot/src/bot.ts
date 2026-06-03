import { Telegraf, Scenes, session, Context } from 'telegraf'
import { Redis } from 'ioredis'
import { prisma } from '@sfa/db'
import type { UserContext } from '@sfa/shared'
import { authMiddleware } from './middleware/auth.middleware'
import { allScenes, SCENE_IDS } from './scenes/index'

// Session: intersection dengan WizardSession agar __scenes terpenuhi
export type SfaSession = Scenes.WizardSession & {
  checkinMode?: 'route' | 'gps' | 'search'
  pendingCustomerId?: string
  pendingCustomerName?: string
  pendingCustomerAddress?: string
  pendingCustomerPhone?: string
  pendingGpsLat?: number
  pendingGpsLng?: number
  pendingOutOfRoute?: boolean
  currentVisitId?: string
  currentCustomerId?: string
  currentCustomerName?: string
  cart?: Array<{ skuId: string; skuName: string; qty: number; unitPrice: number; discountPct: number }>
  // Order scene
  pendingCategory?: string
  pendingSkuId?: string
  pendingSkuName?: string
}

export interface SfaContext extends Context {
  session: SfaSession
  scene: Scenes.SceneContextScene<SfaContext, Scenes.WizardSessionData>
  wizard: Scenes.WizardContextWizard<SfaContext>
  user: UserContext
}

export function createBot(redis: Redis): Telegraf<SfaContext> {
  const bot = new Telegraf<SfaContext>(process.env.BOT_TOKEN!)

  // Redis-backed session
  bot.use(session({
    store: {
      async get(key) {
        const data = await redis.get(`session:${key}`)
        return data ? JSON.parse(data) : undefined
      },
      async set(key, value) {
        await redis.set(`session:${key}`, JSON.stringify(value), 'EX', 86400)
      },
      async delete(key) {
        await redis.del(`session:${key}`)
      }
    }
  }))

  // Auth dulu — ctx.user tersedia di semua scene & command handlers
  bot.use(authMiddleware)
  const stage = new Scenes.Stage(allScenes as any)
  bot.use(stage.middleware() as any)

  // ─── /start ───────────────────────────────────────────────────────────────
  bot.start(async (ctx) => {
    const telegramId = BigInt(ctx.from.id)
    const existing = await prisma.user.findUnique({ where: { telegramId } })

    if (existing?.isActive) {
      await ctx.reply(`Halo, ${existing.fullName}! 👋\n\nKetik /menu untuk memulai.`)
      return
    }

    if (existing && !existing.isActive) {
      await ctx.reply(
        `Halo! Akun kamu sedang menunggu aktivasi.\n\nTelegram ID kamu: \`${ctx.from.id}\`\n\nHubungi admin untuk aktivasi.`,
        { parse_mode: 'Markdown' }
      )
      return
    }

    await prisma.user.create({
      data: {
        telegramId,
        telegramUsername: ctx.from.username ?? null,
        fullName: `${ctx.from.first_name}${ctx.from.last_name ? ` ${ctx.from.last_name}` : ''}`,
        role: 'SALESPERSON',
        isActive: false
      }
    })

    await ctx.reply(
      `Halo! Permintaan akses kamu sudah diterima.\n\nTelegram ID: \`${ctx.from.id}\`\n\nHubungi admin untuk aktivasi akun.`,
      { parse_mode: 'Markdown' }
    )
  })

  // ─── /menu ────────────────────────────────────────────────────────────────
  bot.command('menu', async (ctx) => {
    const { role, fullName } = ctx.user
    const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })

    if (role === 'SALESPERSON') {
      await ctx.reply(
        `Selamat datang, ${fullName}!\n${today}`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🏪 Mulai Kunjungan', callback_data: 'menu:checkin' }],
              [{ text: '📊 Progress Hari Ini', callback_data: 'menu:progress' }],
              [{ text: '📋 Draft Order', callback_data: 'menu:drafts' }]
            ]
          }
        }
      )
      return
    }

    if (role === 'SUPERVISOR') {
      await ctx.reply(
        `Selamat datang, ${fullName}!\n${today}`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📊 Update Tim', callback_data: 'menu:team_update' }],
              [{ text: '✅ Pending Approvals', callback_data: 'menu:approvals' }],
              [{ text: '👤 Detail Per Sales', callback_data: 'menu:sales_detail' }]
            ]
          }
        }
      )
      return
    }

    if (role === 'BACKOFFICE') {
      await ctx.scene.enter(SCENE_IDS.ADMIN)
    }
  })

  // ─── /admin shortcut ──────────────────────────────────────────────────────
  bot.command('admin', async (ctx) => {
    if (ctx.user.role !== 'BACKOFFICE') {
      await ctx.reply('Perintah ini hanya untuk back-office.')
      return
    }
    await ctx.scene.enter(SCENE_IDS.ADMIN)
  })

  // ─── Callback query router ────────────────────────────────────────────────
  bot.on('callback_query', async (ctx) => {
    await ctx.answerCbQuery()
    const data = (ctx.callbackQuery as any).data as string

    if (data === 'menu:checkin') {
      await ctx.scene.enter(SCENE_IDS.CHECKIN)
      return
    }

    if (data === 'menu:progress') {
      const { getTodayVisits } = await import('./services/visit.service')
      const visits = await getTodayVisits(ctx.user.id)
      const ordersTotal = visits.reduce((sum, v) => sum + v.orders.length, 0)
      await ctx.reply(
        `📊 *Progress Hari Ini*\n\n` +
        `📍 Kunjungan: ${visits.length} toko\n` +
        `🛒 Order masuk: ${ordersTotal}`,
        { parse_mode: 'Markdown' }
      )
      return
    }

    await ctx.reply('Fitur ini akan tersedia di sprint berikutnya.')
  })

  bot.catch((err, ctx) => {
    console.error(`Bot error [${ctx.updateType}]:`, err)
    ctx.reply('Terjadi kesalahan. Silakan coba lagi.').catch(() => {})
  })

  return bot
}
