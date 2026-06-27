require('dotenv').config()

const { TelegramClient } = require('telegram')
const { StringSession } = require('telegram/sessions')
const { NewMessage } = require('telegram/events')

const TON_VPN_BOT = '@TonVPN_bot'
const BOT_USERNAME = 'tonvpn_bot'

const BTN = {
  REGISTER: 'Регистрация нового пользователя',
  RUSSIA_RESIDENT: 'Для жителей России',
  OUTLINE: 'Outline',
  UDP: 'UDP',
  GB_50: '50 ГБ / 0.99 $',
}

const PERIOD_MAP = {
  '1d': '1-День',
  '1m': '1-Месяц (Самый Популярный)',
  '3m': '3-Месяца (выгода 5%)',
  '1y': '1-Года (выгода 10%)',
  '2y': '2-Года (выгода 30%)',
  '3y': '3-Года (выгода 50%)',
}

const COUNTRY_MAP = {
  '🇦🇺 Австралия': 'Австралия',
  '🇬🇧 Англия': 'Англия',
  '🇻🇳 Вьетнам': 'Вьетнам',
  '🇩🇪 Германия': 'Германия',
  '🇭🇰 Гонконг': 'Гонконг',
  '🇨🇦 Канада': 'Канада',
  '🇱🇹 Литва': 'Литва',
  '🇳🇱 Нидерланды': 'Нидерланды',
  '🇦🇪 ОАЭ': 'ОАЭ',
  '🇵🇱 Польша': 'Польша',
  '🇷🇺 Россия': 'Россия',
  '🇺🇸 США': 'США',
  '🇸🇬 Сингапур': 'Сингапур',
  '🇹🇷 Турция': 'Турция',
  '🇺🇦 Украина': 'Украина',
  '🇫🇮 Финляндия': 'Финляндия',
  '🇫🇷 Франция': 'Франция',
  '🇸🇪 Швеция': 'Швеция',
  '🇯🇵 Япония': 'Япония',
}

class TonVpnClient {
  constructor() {
    this.client = new TelegramClient(
      new StringSession('1AgAOMTQ5LjE1NC4xNjcuNTEBuzKseMTIkAlFtpfXOdr0xUelM6CRA7yhsFJpR3wSeFL9kacQdpO0gzfooueoB3iQEdboAn1adbRI0KoPqW/ZvCbA1VfQun5VQQ0vdIoCud4J5UTS2oA5kCyEU4HDtef572ZZdHnEKxF+13r7857kASLzSL0SCWfApmwQkqvZ/+Sl+0nQpLGuYhZTRtkMu1P4DGY9QESbi9gmSgsPXlF3o31FXT+hnyizRgAmSzI013KFzCI0klWJyVHtPOAcJi+jbHKguZTlI1W12qjeECqbxI5Knyx4+A8+XTrJI19nnijrn4RnYaelwy9uj7dyt6UIQthsDa8G0Fi8h4GCHzIbYx8=  '),
      2040,
      'b18441a1ff607e10a989891a5462e627',
      { connectionRetries: 5 }
    )
    this.connected = false
    // Serializes all getKey calls so only one GramJS flow runs at a time
    this.queue = Promise.resolve()
  }

  async connect() {
    if (!this.connected) {
      await this.client.connect()
      this.connected = true
      console.log('GramJS connected')
    }
  }

  waitForMessage(timeout = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.client.removeEventHandler(handler)
        reject(new Error('TON VPN timeout'))
      }, timeout)

      const handler = async (event) => {
        try {
          const msg = event.message
          const sender = await msg.getSender()
          if (sender && sender.username && sender.username.toLowerCase() === BOT_USERNAME) {
            clearTimeout(timer)
            this.client.removeEventHandler(handler)
            resolve(msg)
          }
        } catch (_) {
          // ignore errors from irrelevant messages
        }
      }

      this.client.addEventHandler(handler, new NewMessage({}))
    })
  }

  // Universal: tries inline button first, falls back to sending text
  async clickButton(message, buttonText) {
    const rows = message.replyMarkup?.rows || []
    for (const row of rows) {
      for (const btn of row.buttons) {
        if (btn.text && btn.text.includes(buttonText)) {
          console.log(`[CLICK] Inline button: "${btn.text}"`)
          await message.click({ text: btn.text })
          return true
        }
      }
    }
    console.log(`[CLICK] Fallback text: "${buttonText}"`)
    await this.sendMessage(buttonText)
    return false
  }

  async sendMessage(text) {
    await this.client.sendMessage(TON_VPN_BOT, { message: text })
  }

  // Public entry point — queues requests so GramJS flows don't interleave
  getKey(country, period) {
    const result = this.queue.then(() => this._getKey(country, period))
    this.queue = result.catch(() => {})
    return result
  }

  async _getKey(country, period) {
    await this.connect()

    const countryBtn = COUNTRY_MAP[country]
    if (!countryBtn) throw new Error('Unknown country: ' + country)

    const periodBtn = PERIOD_MAP[period]
    if (!periodBtn) throw new Error('Unknown period: ' + period)

    console.log('═══ НАЧАЛО ПОЛУЧЕНИЯ КЛЮЧА ═══')
    console.log('Страна:', country, '→', countryBtn)
    console.log('Период:', period, '→', periodBtn)

    // Шаг 1: регистрация
    console.log('\n[ШАГ 1] Отправляем /start')
    await this.sendMessage('/start')
    await this.sleep(2000)
    console.log('[ШАГ 1] Нажимаем: "' + BTN.REGISTER + '"')
    await this.sendMessage(BTN.REGISTER)
    let msg = await this.waitForMessage()
    console.log('[ШАГ 1] TON VPN ответил:', msg.text || msg.message)
    console.log('[ШАГ 1] Кнопки:', this.getButtons(msg))

    // Шаг 2: страна проживания — всегда "Для жителей России"
    console.log('\n[ШАГ 2] Нажимаем: "' + BTN.RUSSIA_RESIDENT + '"')
    await this.clickButton(msg, BTN.RUSSIA_RESIDENT)
    msg = await this.waitForMessage()
    console.log('[ШАГ 2] TON VPN ответил:', msg.text || msg.message)
    console.log('[ШАГ 2] Кнопки:', this.getButtons(msg))

    // Шаг 3: протокол — Outline
    console.log('\n[ШАГ 3] Нажимаем: "' + BTN.OUTLINE + '"')
    await this.clickButton(msg, BTN.OUTLINE)
    msg = await this.waitForMessage()
    console.log('[ШАГ 3] TON VPN ответил:', msg.text || msg.message)
    console.log('[ШАГ 3] Кнопки:', this.getButtons(msg))

    // Шаг 4: порт — UDP
    console.log('\n[ШАГ 4] Нажимаем: "' + BTN.UDP + '"')
    await this.clickButton(msg, BTN.UDP)
    msg = await this.waitForMessage()
    console.log('[ШАГ 4] TON VPN ответил:', msg.text || msg.message)
    console.log('[ШАГ 4] Кнопки:', this.getButtons(msg))

    // Шаг 5: страна сервера
    console.log('\n[ШАГ 5] Нажимаем: "' + countryBtn + '"')
    await this.clickButton(msg, countryBtn)
    msg = await this.waitForMessage()
    console.log('[ШАГ 5] TON VPN ответил:', msg.text || msg.message)
    console.log('[ШАГ 5] Кнопки:', this.getButtons(msg))

    // Шаг 6: срок
    console.log('\n[ШАГ 6] Нажимаем: "' + periodBtn + '"')
    await this.clickButton(msg, periodBtn)
    msg = await this.waitForMessage()
    console.log('[ШАГ 6] TON VPN ответил:', msg.text || msg.message)
    console.log('[ШАГ 6] Кнопки:', this.getButtons(msg))

    // Шаг 7: трафик — 50 ГБ
    console.log('\n[ШАГ 7] Нажимаем: "' + BTN.GB_50 + '"')
    await this.clickButton(msg, BTN.GB_50)
    msg = await this.waitForMessage()
    const text = msg.text || msg.message || ''
    console.log('[ШАГ 7] TON VPN ответил:', text)

    const ssconfKey = this.extractKey(text)
    console.log('\n[РЕЗУЛЬТАТ] Ключ:', ssconfKey)

    if (!ssconfKey) throw new Error('Key not found in: ' + text)

    console.log('═══ КЛЮЧ ПОЛУЧЕН УСПЕШНО ═══')
    return ssconfKey
  }

  getButtons(msg) {
    const rows = msg.replyMarkup?.rows || []
    return rows.flatMap(row => row.buttons.map(b => b.text))
  }

  extractKey(text) {
    const match = text.match(/ssconf:\/\/[^\s\n]+/)
    return match ? match[0] : null
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

module.exports = new TonVpnClient()
