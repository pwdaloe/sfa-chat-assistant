import { Scenes, Markup } from 'telegraf'
import { prisma } from '@sfa/db'
import type { SfaContext } from '../bot'

// Hanya back-office yang bisa akses — dicek di bot.ts sebelum enter scene

async function stepAdminMenu(ctx: SfaContext) {
  await ctx.reply(
    '🔧 Admin Panel',
    Markup.inlineKeyboard([
      [Markup.button.callback('👥 Pending Users', 'admin:pending_users')],
      [Markup.button.callback('✅ Aktifkan User', 'admin:activate')],
      [Markup.button.callback('👤 Set Supervisor', 'admin:set_supervisor')],
      [Markup.button.callback('❌ Tutup', 'admin:close')]
    ])
  )
  return ctx.wizard.next()
}

async function stepAdminAction(ctx: SfaContext) {
  await ctx.answerCbQuery?.()
  const cb = (ctx.callbackQuery as any)?.data as string | undefined
  const msg = (ctx.message as any)?.text as string | undefined

  if (cb === 'admin:close') {
    await ctx.reply('Admin panel ditutup.')
    return ctx.scene.leave()
  }

  if (cb === 'admin:pending_users') {
    const pending = await prisma.user.findMany({
      where: { isActive: false },
      orderBy: { createdAt: 'desc' },
      take: 10
    })
    if (pending.length === 0) {
      await ctx.reply('Tidak ada user pending.')
      return
    }
    const text = pending.map(u =>
      `• ${u.fullName}\n  ID: \`${u.telegramId}\`\n  @${u.telegramUsername ?? '-'}`
    ).join('\n\n')
    await ctx.reply(
      `*Pending Users (${pending.length}):*\n\n${text}\n\n` +
      `Untuk aktifkan, ketik:\n\`aktifkan [TelegramID]\``,
      { parse_mode: 'Markdown' }
    )
    return
  }

  if (cb === 'admin:activate') {
    await ctx.reply('Ketik: `aktifkan [TelegramID] [SALESPERSON|SUPERVISOR|BACKOFFICE]`\nContoh: `aktifkan 123456789 SALESPERSON`', { parse_mode: 'Markdown' })
    return
  }

  if (cb === 'admin:set_supervisor') {
    await ctx.reply('Ketik: `setsupervisor [sales_TelegramID] [supervisor_TelegramID]`\nContoh: `setsupervisor 111 222`', { parse_mode: 'Markdown' })
    return
  }

  // ── Text commands ─────────────────────────────────────────────────────────
  if (msg?.startsWith('aktifkan ')) {
    const parts = msg.split(' ')
    const telegramId = BigInt(parts[1] ?? '0')
    const role = (parts[2] ?? 'SALESPERSON').toUpperCase() as any

    if (!['SALESPERSON', 'SUPERVISOR', 'BACKOFFICE'].includes(role)) {
      await ctx.reply('Role tidak valid. Gunakan: SALESPERSON / SUPERVISOR / BACKOFFICE')
      return
    }

    const updated = await prisma.user.update({
      where: { telegramId },
      data: { isActive: true, role }
    }).catch(() => null)

    if (!updated) {
      await ctx.reply(`User dengan Telegram ID ${telegramId} tidak ditemukan.`)
      return
    }
    await ctx.reply(`✅ ${updated.fullName} diaktifkan sebagai ${role}.`)
    return
  }

  if (msg?.startsWith('setsupervisor ')) {
    const parts = msg.split(' ')
    const salesTgId = BigInt(parts[1] ?? '0')
    const spvTgId = BigInt(parts[2] ?? '0')

    const [sales, spv] = await Promise.all([
      prisma.user.findUnique({ where: { telegramId: salesTgId } }),
      prisma.user.findUnique({ where: { telegramId: spvTgId } })
    ])

    if (!sales || !spv) {
      await ctx.reply('User tidak ditemukan. Cek Telegram ID.')
      return
    }

    await prisma.user.update({
      where: { id: sales.id },
      data: { supervisorId: spv.id }
    })
    await ctx.reply(`✅ ${sales.fullName} → supervisor: ${spv.fullName}`)
    return
  }
}

export const adminScene = new Scenes.WizardScene(
  'ADMIN',
  stepAdminMenu,
  stepAdminAction
) as unknown as Scenes.WizardScene<SfaContext>
