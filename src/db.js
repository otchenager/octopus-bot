const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || "postgresql://postgres:jEmZCWZNJZTvhcejqibyYvaSoWvWFzvQ@reseau.proxy.rlwy.net:44095/railway"
    }
  }
})
const USD_TO_RUB = 77

async function getOrCreateUser(telegramId, username) {
  return prisma.user.upsert({
    where: { telegramId: BigInt(telegramId) },
    update: {},
    create: { telegramId: BigInt(telegramId), username: username || null, balance: 0.54 },
  })
}

async function deductBalance(telegramId, amount) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { telegramId: BigInt(telegramId) } })
    if (!user || user.balance < amount) throw new Error('Insufficient balance')
    return tx.user.update({
      where: { telegramId: BigInt(telegramId) },
      data: { balance: { decrement: amount } },
    })
  })
}

async function addBalance(telegramId, amount) {
  return prisma.user.update({
    where: { telegramId: BigInt(telegramId) },
    data: { balance: { increment: amount } },
  })
}

async function getBalance(telegramId) {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } })
  return user ? user.balance : 0
}

module.exports = { getOrCreateUser, deductBalance, addBalance, getBalance, USD_TO_RUB }
