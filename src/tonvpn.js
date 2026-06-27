require('dotenv').config()

const { TelegramClient } = require('telegram')
const { StringSession } = require('telegram/sessions')
const { NewMessage } = require('telegram/events')

const TON_VPN_BOT = '@TonVPN_bot'
const BOT_USERNAME = 'tonvpn_bot'

const BTN = {
  REGISTER: '🧞‍♂️Регистрация нового пользователя',
  RUSSIA_RESIDENT: '🇷🇺Для жителей России',
  OUTLINE: 'Outline',
  UDP: 'UDP',
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
    this.busy = false
    this.queue = []
  }

  async connect() {
    if (!this.connected) {
      await this.client.connect()
      this.connected = true
      console.log('GramJS connected')
    }
  }

  waitForMessage(timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.client.removeEventHandler(handler)
        reject(new Error('TON VPN timeout'))
      }, timeout)

      const handler = async (event) => {
        try {
          const msg = event.message
          const sender = await msg.getSender()
          console.log('Incoming message from:', sender?.username, '| text:', msg.text?.slice(0, 50))
          const isTonVpn = sender?.username?.toLowerCase() === BOT_USERNAME
            || msg.text?.includes('Регистрация нового пользователя')
            || msg.text?.includes('Добро пожаловать')
          if (isTonVpn) {
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

  async clickInlineButton(msg, buttonText) {
    const rows = msg.replyMarkup?.rows || []

    console.log('  [BUTTONS AVAILABLE]:')
    for (const row of rows) {
      for (const btn of row.buttons) {
        console.log(`    "${btn.text}" | data type: ${typeof btn.data} | data: ${JSON.stringify(btn.data)}`)
      }
    }

    for (const row of rows) {
      for (const btn of row.buttons) {
        if (btn.text?.includes(buttonText)) {
          console.log(`  [CLICK] Found: "${btn.text}"`)

          if (btn.data && btn.data.length > 0) {
            console.log('  [CLICK] Clicking by Buffer data')
            await msg.click({ data: btn.data })
          } else {
            console.log('  [CLICK] No data, fallback to text click')
            try {
              await msg.click({ text: btn.text })
            } catch (e) {
              console.log('  [CLICK] Text click failed, fallback to sendMessage')
              await this.sendMessage(btn.text)
            }
          }

          await this.sleep(500)
          return
        }
      }
    }

    const available = rows.flatMap(r => r.buttons.map(b => b.text))
    throw new Error(`Button "${buttonText}" not found. Available: ${JSON.stringify(available)}`)
  }

  async sendMessage(text) {
    await this.client.sendMessage(TON_VPN_BOT, { message: text })
  }

  async getKey(country, period) {
    return new Promise((resolve, reject) => {
      this.queue.push({ country, period, resolve, reject })
      this.processQueue()
    })
  }

  async processQueue() {
    if (this.busy || this.queue.length === 0) return
    this.busy = true
    const { country, period, resolve, reject } = this.queue.shift()
    try {
      resolve(await this._getKey(country, period))
    } catch (err) {
      reject(err)
    } finally {
      this.busy = false
      this.processQueue()
    }
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

    // Step 1: /start → welcome text only (ReplyKeyboard)
    console.log('\n[ШАГ 1] Отправляем /start')
    await this.sendMessage('/start')
    let msg = await this.waitForMessage()
    console.log('[ШАГ 1] Приветствие:', msg.text?.slice(0, 60))

    // Step 2: nudge to trigger ReplyKeyboard menu (ReplyKeyboard)
    await this.sleep(800)
    console.log('\n[ШАГ 2] Отправляем "Привет" для вызова меню')
    await this.sendMessage('Привет')
    msg = await this.waitForMessage()
    console.log('[ШАГ 2] Меню. Кнопки:', this.getButtons(msg))

    // Step 3: registration (ReplyKeyboard)
    await this.sleep(800)
    console.log('\n[ШАГ 3] Отправляем: "' + BTN.REGISTER + '"')
    await this.sendMessage(BTN.REGISTER)
    msg = await this.waitForMessage()
    console.log('[ШАГ 3] TON VPN ответил:', msg.text?.slice(0, 80))

    // Steps 4-8: inline buttons — click by Buffer data
    await this.sleep(800)
    console.log('\n[ШАГ 4] clickInlineButton: "' + BTN.RUSSIA_RESIDENT + '"')
    await this.clickInlineButton(msg, 'Для жителей России')
    msg = await this.waitForMessage()
    console.log('[ШАГ 4] TON VPN ответил:', msg.text?.slice(0, 80))

    await this.sleep(800)
    console.log('\n[ШАГ 5] clickInlineButton: "' + BTN.OUTLINE + '"')
    await this.clickInlineButton(msg, BTN.OUTLINE)
    msg = await this.waitForMessage()
    console.log('[ШАГ 5] TON VPN ответил:', msg.text?.slice(0, 80))

    await this.sleep(800)
    console.log('\n[ШАГ 6] clickInlineButton: "' + BTN.UDP + '"')
    await this.clickInlineButton(msg, BTN.UDP)
    msg = await this.waitForMessage()
    console.log('[ШАГ 6] TON VPN ответил:', msg.text?.slice(0, 80))

    await this.sleep(800)
    console.log('\n[ШАГ 7] clickInlineButton: "' + countryBtn + '"')
    await this.clickInlineButton(msg, countryBtn)
    msg = await this.waitForMessage()
    console.log('[ШАГ 7] TON VPN ответил:', msg.text?.slice(0, 80))

    await this.sleep(800)
    console.log('\n[ШАГ 8] clickInlineButton: "' + periodBtn + '"')
    await this.clickInlineButton(msg, periodBtn)
    msg = await this.waitForMessage()
    console.log('[ШАГ 8] TON VPN ответил:', msg.text?.slice(0, 80))

    // Step 9: traffic — click first available option by Buffer data (price varies by period)
    const rows = msg.replyMarkup?.rows || []
    const trafficBtns = rows.flatMap(r => r.buttons)
    console.log('\n[ШАГ 9] Доступные варианты трафика:', trafficBtns.map(b => b.text))
    if (!trafficBtns.length) throw new Error('No traffic buttons in: ' + (msg.text || ''))

    const trafficBtn = trafficBtns[0]
    console.log('[ШАГ 9] Выбираем: "' + trafficBtn.text + '"')
    if (trafficBtn.data && trafficBtn.data.length > 0) {
      console.log('[ШАГ 9] Clicking by Buffer data')
      await msg.click({ data: trafficBtn.data })
    } else {
      console.log('[ШАГ 9] No data, clicking by text')
      await msg.click({ text: trafficBtn.text })
    }
    await this.sleep(500)
    msg = await this.waitForMessage()
    const text = msg.text || msg.message || ''
    console.log('[ШАГ 9] TON VPN ответил:', text)

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
