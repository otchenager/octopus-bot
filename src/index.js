require('dotenv').config()
const { Telegraf, Markup } = require('telegraf')
const tonvpn = require('./tonvpn')
const { ssconfToSs } = require('./converter')
const { getOrCreateUser, deductBalance, getBalance, USD_TO_RUB } = require('./db')

const bot = new Telegraf('8686816041:AAGZ8qCE_eWWuqdiH6yZ2f0DotRik7BgGvE')

// ─────────────────────────────────────
// Конфиг тарифов
// ─────────────────────────────────────
const PLANS = {
  '1d': { label: '1 день',    classic: 0.19,  max: 0.23  },
  '1m': { label: '1 месяц',   classic: 0.99,  max: 1.49  },
  '3m': { label: '3 месяца',  classic: 2.79,  max: 3.50  },
  '1y': { label: '1 год',     classic: 9.99,  max: 13.79 },
  '2y': { label: '2 года',    classic: 17.99, max: 23.49 },
  '3y': { label: '3 года',    classic: 22.99, max: 27.99 },
}

const COUNTRIES = [
  '🇦🇺 Австралия', '🇬🇧 Англия',
  '🇻🇳 Вьетнам',   '🇩🇪 Германия',
  '🇭🇰 Гонконг',   '🇨🇦 Канада',
  '🇱🇹 Литва',     '🇳🇱 Нидерланды',
  '🇦🇪 ОАЭ',       '🇵🇱 Польша',
  '🇷🇺 Россия',    '🇺🇸 США',
  '🇸🇬 Сингапур',  '🇹🇷 Турция',
  '🇺🇦 Украина',   '🇫🇮 Финляндия',
  '🇫🇷 Франция',   '🇸🇪 Швеция',
  '🇯🇵 Япония',
]

// Простое хранилище сессий в памяти
const sessions = {}
const getSession = (id) => { if (!sessions[id]) sessions[id] = {}; return sessions[id] }

function fmtUsd(n) { return '$' + n.toFixed(2) }
function fmtRub(n) { return Math.round(n * USD_TO_RUB) + ' ₽' }
function fmtBoth(n) { return `${fmtUsd(n)} (~${fmtRub(n)})` }

// ─────────────────────────────────────
// /start
// ─────────────────────────────────────
bot.start(async (ctx) => {
  await ctx.reply(
    '🐙 *Добро пожаловать в Octopus VPN!*\n\nСвобода интернета без границ.',
    {
      parse_mode: 'Markdown',
      ...Markup.keyboard([
        ['🔑 Получить ключ'],
        ['💎 Баланс'],
        ['❓ Помощь']
      ]).resize()
    }
  )
})

// ─────────────────────────────────────
// Помощь
// ─────────────────────────────────────
bot.hears('❓ Помощь', async (ctx) => {
  await ctx.reply(
    '❓ *Помощь*\n\n' +
    '*Outline* — скачайте приложение Outline, нажмите + и вставьте ключ из буфера\n\n' +
    '*Happ* — скачайте Happ, нажмите + → Из буфера\n\n' +
    'По вопросам: @otchenager',
    { parse_mode: 'Markdown' }
  )
})

// ─────────────────────────────────────
// Баланс
// ─────────────────────────────────────
bot.hears('💎 Баланс', async (ctx) => {
  const balance = await getBalance(ctx.from.id)
  await ctx.reply(
    `💎 Ваш баланс: ${fmtBoth(balance)}\n\nПополнить:`,
    {
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('229 ₽', 'topup_229'),
          Markup.button.callback('419 ₽', 'topup_419'),
          Markup.button.callback('999 ₽', 'topup_999'),
        ]
      ])
    }
  )
})

bot.action(/^topup_\d+$/, async (ctx) => {
  await ctx.answerCbQuery()
  await ctx.reply('💳 Оплата через СБП скоро будет доступна. Следите за обновлениями!')
})

bot.action('goto_balance', async (ctx) => {
  await ctx.answerCbQuery()
  const balance = await getBalance(ctx.from.id)
  await ctx.editMessageText(
    `💎 Ваш баланс: ${fmtBoth(balance)}\n\nПополнить:`,
    {
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('229 ₽', 'topup_229'),
          Markup.button.callback('419 ₽', 'topup_419'),
          Markup.button.callback('999 ₽', 'topup_999'),
        ]
      ])
    }
  )
})

// ─────────────────────────────────────
// Шаг 1: Выбор клиента
// ─────────────────────────────────────
bot.hears('🔑 Получить ключ', async (ctx) => {
  getSession(ctx.from.id).step = 'client'

  await ctx.reply(
    '📱 *Шаг 1 из 4 — Выберите VPN клиент*',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🌊 Outline', 'client_outline')],
        [Markup.button.callback('⚡ Happ', 'client_happ')]
      ])
    }
  )
})

// ─────────────────────────────────────
// Шаг 2: Выбор страны
// ─────────────────────────────────────
bot.action(/^client_(outline|happ)$/, async (ctx) => {
  await ctx.answerCbQuery()
  getSession(ctx.from.id).client = ctx.match[1]

  const buttons = []
  for (let i = 0; i < COUNTRIES.length; i += 2) {
    const row = [Markup.button.callback(COUNTRIES[i], 'country_' + i)]
    if (COUNTRIES[i + 1]) row.push(Markup.button.callback(COUNTRIES[i + 1], 'country_' + (i + 1)))
    buttons.push(row)
  }

  await ctx.editMessageText(
    '🌍 *Шаг 2 из 4 — Выберите страну сервера*',
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
  )
})

// ─────────────────────────────────────
// Шаг 3: Выбор срока
// ─────────────────────────────────────
bot.action(/^country_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery()
  const idx = parseInt(ctx.match[1])
  getSession(ctx.from.id).country = COUNTRIES[idx]

  const buttons = Object.entries(PLANS).map(([key, plan]) => [
    Markup.button.callback(plan.label, 'period_' + key)
  ])

  await ctx.editMessageText(
    '📅 *Шаг 3 из 4 — Выберите срок*',
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
  )
})

// ─────────────────────────────────────
// Шаг 4: Выбор тарифа
// ─────────────────────────────────────
bot.action(/^period_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery()
  const period = ctx.match[1]
  const plan = PLANS[period]
  getSession(ctx.from.id).period = period

  await ctx.editMessageText(
    `💎 *Шаг 4 из 4 — Выберите тариф*\n\n` +
    `*Классический* — ${fmtUsd(plan.classic)}/период\n` +
    `*Максимальный* — ${fmtUsd(plan.max)}/период\n\n` +
    `_Максимальный включает приоритетную поддержку при сбоях_`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback(`⭐ Классический — ${fmtUsd(plan.classic)}`, 'tariff_classic')],
        [Markup.button.callback(`💎 Максимальный — ${fmtUsd(plan.max)}`, 'tariff_max')]
      ])
    }
  )
})

// ─────────────────────────────────────
// Подтверждение → оплата
// ─────────────────────────────────────
bot.action(/^tariff_(classic|max)$/, async (ctx) => {
  await ctx.answerCbQuery()
  const tariff = ctx.match[1]
  const sess = getSession(ctx.from.id)
  sess.tariff = tariff

  const { client, country, period } = sess
  const plan = PLANS[period]
  const price = plan[tariff]

  await ctx.editMessageText(
    `💳 *Оплата*\n\n` +
    `Клиент: ${client === 'outline' ? 'Outline' : 'Happ'}\n` +
    `Страна: ${country}\n` +
    `Срок: ${plan.label}\n` +
    `Тариф: ${tariff === 'classic' ? 'Классический' : 'Максимальный'}\n` +
    `Сумма: ${fmtBoth(price)}\n\n` +
    `Нажмите кнопку ниже для списания с баланса`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Оплатить с баланса', 'confirm_payment')]
      ])
    }
  )
})

// ─────────────────────────────────────
// Выдача ключа
// ─────────────────────────────────────
bot.action('confirm_payment', async (ctx) => {
  await ctx.answerCbQuery()
  const sess = getSession(ctx.from.id)
  const { client, country, period, tariff } = sess
  const plan = PLANS[period]
  const price = plan[tariff]

  const user = await getOrCreateUser(ctx.from.id, ctx.from.username)

  if (user.balance < price) {
    const rubBalance = fmtRub(user.balance)
    const rubPrice = fmtRub(price)
    return ctx.editMessageText(
      `❌ *Недостаточно средств*\n\n` +
      `Ваш баланс: ${fmtUsd(user.balance)} (~${rubBalance})\n` +
      `Необходимо: ${fmtUsd(price)} (~${rubPrice})`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💎 Пополнить баланс', 'goto_balance')]
        ])
      }
    )
  }

  await ctx.editMessageText('⏳ Получаем ваш ключ...')

  try {
    const updatedUser = await deductBalance(ctx.from.id, price)
    const ssconfKey = await tonvpn.getKey(country, period)

    let finalKey
    let appName
    let instruction

    if (client === 'happ') {
      finalKey = await ssconfToSs(ssconfKey)
      appName = 'Happ'
      instruction = 'Откройте Happ → нажмите + → Из буфера → вставьте ключ'
    } else {
      finalKey = ssconfKey
      appName = 'Outline'
      instruction = 'Откройте Outline → нажмите + → вставьте ключ из буфера'
    }

    const remaining = updatedUser.balance
    await ctx.editMessageText(
      `✅ *Ваш ключ активирован!*\n\n` +
      `Страна: ${country}\n` +
      `Срок: ${plan.label}\n` +
      `Приложение: ${appName}\n` +
      `💎 Остаток: ${fmtBoth(remaining)}\n\n` +
      `🔑 *Ваш ключ:*\n\`${finalKey}\`\n\n` +
      `📱 *Как подключиться:*\n${instruction}`,
      { parse_mode: 'Markdown' }
    )

    delete sessions[ctx.from.id]

  } catch (err) {
    console.error('Key error:', err)
    await ctx.editMessageText(
      '❌ Ошибка при получении ключа. Обратитесь в поддержку: @octopus\\_support',
      { parse_mode: 'Markdown' }
    )
  }
})

// ─────────────────────────────────────
// Запуск
// ─────────────────────────────────────
bot.launch()
console.log('🐙 Octopus Bot v2 started!')

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
