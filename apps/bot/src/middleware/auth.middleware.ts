import { Context, MiddlewareFn } from 'telegraf'
import { prisma } from '@sfa/db'
import type { SfaContext } from '../bot'

export const authMiddleware: MiddlewareFn<SfaContext> = async (ctx, next) => {
  const telegramId = ctx.from?.id
  if (!telegramId) return

  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
    select: { id: true, telegramId: true, fullName: true, role: true, supervisorId: true, isActive: true }
  })

  if (!user || !user.isActive) {
    await ctx.reply(
      'Akun kamu belum terdaftar atau tidak aktif.\n' +
      'Hubungi admin untuk mendaftarkan akun.'
    )
    return
  }

  ctx.user = {
    id: user.id,
    telegramId: user.telegramId,
    fullName: user.fullName,
    role: user.role as any,
    supervisorId: user.supervisorId
  }

  return next()
}
