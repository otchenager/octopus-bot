require('dotenv').config()
const { Telegraf, Markup } = require('telegraf')
const fetch = require('node-fetch')
const tonvpn = require('./tonvpn')
const { ssconfToSs } = require('./converter')
const { getOrCreateUser, deductBalance, addBalance, getBalance, USD_TO_RUB } = require('./db')

const YOOMONEY_TOKEN = process.env.YOOMONEY_TOKEN
const YOOMONEY_WALLET = '4100119060879391'

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

bot.action(/^topup_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery()
  const amount = parseInt(ctx.match[1])
  const label = ctx.from.id.toString()
  const payUrl = `https://yoomoney.ru/quickpay/confirm?receiver=${YOOMONEY_WALLET}&quickpay-form=button&sum=${amount}&label=${label}&successURL=https://t.me/octopus_keysvpn_core_bot`

  await ctx.reply(
    '💳 Оплата через YooMoney\n\nНажмите кнопку ниже для перехода на страницу оплаты:',
    Markup.inlineKeyboard([
      [Markup.button.url('💳 Оплатить ' + amount + ' ₽', payUrl)]
    ])
  )
  await ctx.reply(
    'После оплаты нажмите кнопку ниже:',
    Markup.inlineKeyboard([
      [Markup.button.callback('✅ Я оплатил', 'check_payment_' + amount)]
    ])
  )
})

async function checkYooMoneyPayment(telegramId, expectedAmount) {
  const response = await fetch('https://yoomoney.ru/api/operation-history', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + YOOMONEY_TOKEN,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'label=' + telegramId + '&operation_types=deposition'
  })
  const data = await response.json()

  const now = Date.now()
  const payment = data.operations?.find(op =>
    op.label === telegramId.toString() &&
    op.amount >= expectedAmount &&
    (now - new Date(op.datetime).getTime()) < 30 * 60 * 1000
  )

  return payment || null
}

bot.action(/^check_payment_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery()
  const amount = parseInt(ctx.match[1])
  const telegramId = ctx.from.id

  await ctx.reply('🔍 Проверяем платёж...')

  const payment = await checkYooMoneyPayment(telegramId, amount)

  if (payment) {
    const dollars = amount / USD_TO_RUB
    await addBalance(telegramId, dollars)
    const user = await getOrCreateUser(telegramId, ctx.from.username)
    const newBalance = user.balance
    await ctx.reply(
      '✅ Баланс пополнен!\n\n' +
      'Пополнено: ' + amount + ' ₽ (~$' + dollars.toFixed(2) + ')\n' +
      '💎 Новый баланс: $' + newBalance.toFixed(2) + ' (~' + Math.round(newBalance * USD_TO_RUB) + ' ₽)'
    )
  } else {
    await ctx.reply(
      '❌ Платёж не найден.\n\n' +
      'Убедитесь что:\n' +
      '• Перевод выполнен на кошелёк ' + YOOMONEY_WALLET + '\n' +
      '• Сумма точная: ' + amount + ' ₽\n' +
      '• Прошло не более 30 минут\n\n' +
      'Попробуйте через минуту.'
    )
  }
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
  const { client, country, period } = sess
  const tariff = sess.tariff || 'classic'
  const plan = PLANS[period]
  const price = plan[tariff] || plan.classic

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

  const countdownMsg = await ctx.reply('⏳ Получаем ваш ключ... 25')
  let countdownDone = false

  // Countdown runs in parallel with key fetch; stops as soon as result is ready
  const countdown = (async () => {
    for (let i = 24; i >= 1; i--) {
      if (countdownDone) break
      await new Promise(r => setTimeout(r, 1000))
      if (countdownDone) break
      try {
        await ctx.telegram.editMessageText(ctx.chat.id, countdownMsg.message_id, null, '⏳ Получаем ваш ключ... ' + i)
      } catch (_) {}
    }
  })()

  try {
    const updatedUser = await deductBalance(ctx.from.id, price)
    const ssconfKey = await tonvpn.getKey(country, period)
    countdownDone = true

    const cleanKey = ssconfKey.replace(/`/g, '').trim()

    let finalKey
    let appName
    let instruction

    if (client === 'happ') {
      finalKey = await ssconfToSs(cleanKey)
      appName = 'Happ'
      instruction = 'Откройте Happ → нажмите + → Из буфера → вставьте ключ'
    } else {
      finalKey = cleanKey
      appName = 'Outline'
      instruction = 'Откройте Outline → нажмите + → вставьте ключ из буфера'
    }

    const remaining = updatedUser.balance
    await ctx.telegram.editMessageText(
      ctx.chat.id, countdownMsg.message_id, null,
      '✅ Ваш ключ активирован!\n\n' +
      'Страна: ' + country + '\n' +
      'Срок: ' + plan.label + '\n' +
      'Приложение: ' + appName + '\n' +
      '💎 Остаток: $' + remaining.toFixed(2) + ' (~' + Math.round(remaining * 78) + ' ₽)\n\n' +
      '🔑 Ваш ключ:\n' + finalKey + '\n\n' +
      '📱 Как подключиться:\n' + instruction
    )

    delete sessions[ctx.from.id]

  } catch (err) {
    countdownDone = true
    console.error('Key error:', err)
    await ctx.telegram.editMessageText(
      ctx.chat.id, countdownMsg.message_id, null,
      '❌ Ошибка при получении ключа. Обратитесь в поддержку: @otchenager'
    )
  }
})

// ─────────────────────────────────────
// Запуск
// ─────────────────────────────────────
bot.launch()
console.log('🐙 Octopus Bot v2 started!')
// Подключаем GramJS сразу при старте
tonvpn.connect().then(() => {
  console.log('GramJS ready — listening to TON VPN')
}).catch(err => {
  console.error('GramJS connect error:', err)
})
//залупа коня бадулая



process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
