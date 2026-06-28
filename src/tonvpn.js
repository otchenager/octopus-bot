require('dotenv').config()

const { TelegramClient } = require('telegram')
const { StringSession } = require('telegram/sessions')
const { NewMessage } = require('telegram/events')
let EditedMessage
try {
  EditedMessage = require('telegram/events').EditedMessage
} catch(e) {
  console.log('EditedMessage not available, using NewMessage only')
}

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
        this.client.removeEventHandler(newHandler)
        this.client.removeEventHandler(editHandler)
        reject(new Error('TON VPN timeout'))
      }, timeout)

      const resolve_once = (msg) => {
        clearTimeout(timer)
        this.client.removeEventHandler(newHandler)
        this.client.removeEventHandler(editHandler)
        resolve(msg)
      }

      const checkSender = async (event) => {
        try {
          const msg = event.message
          const sender = await msg.getSender()
          if (sender?.username?.toLowerCase() === BOT_USERNAME) {
            console.log('Incoming (new/edit) from tonvpn_bot | text:', msg.text?.slice(0, 60))
            resolve_once(msg)
          }
        } catch(_) {}
      }

      const newHandler = async (event) => checkSender(event)
      const editHandler = async (event) => checkSender(event)

      this.client.addEventHandler(newHandler, new NewMessage({}))
      if (EditedMessage) {
        this.client.addEventHandler(editHandler, new EditedMessage({}))
      }
    })
  }

  async clickInlineButton(msg, buttonText) {
    const rows = msg.replyMarkup?.rows || []

    console.log('  [AVAILABLE BUTTONS]:')
    for (const row of rows) {
      for (const btn of row.buttons) {
        try {
          const raw = btn.data?.data ?? btn.data
          const command = raw ? Buffer.from(raw).toString('utf8') : 'NO_DATA'
          console.log(`    "${btn.text}" → "${command}"`)
        } catch(e) {
          console.log(`    "${btn.text}" → decode error: ${e.message}`)
        }
      }
    }

    for (const row of rows) {
      for (const btn of row.buttons) {
        if (btn.text?.includes(buttonText)) {
          try {
            const raw = btn.data?.data ?? btn.data
            const command = Buffer.from(raw).toString('utf8')
            console.log(`  [SEND] "${btn.text}" → sendMessage("${command}")`)
            const responsePromise = this.waitForMessage()
            await this.sendMessage(command)
            await this.sleep(800)
            return responsePromise
          } catch(e) {
            console.log(`  [FALLBACK] decode failed, sending text: "${btn.text}"`)
            const responsePromise = this.waitForMessage()
            await this.sendMessage(btn.text)
            await this.sleep(800)
            return responsePromise
          }
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
    let nextMsg = this.waitForMessage()
    await this.sendMessage('/start')
    let msg = await nextMsg
    console.log('[ШАГ 1] Приветствие:', msg.text?.slice(0, 60))

    // Step 2: nudge to trigger ReplyKeyboard menu (ReplyKeyboard)
    await this.sleep(800)
    console.log('\n[ШАГ 2] Отправляем "Привет" для вызова меню')
    nextMsg = this.waitForMessage()
    await this.sendMessage('Привет')
    msg = await nextMsg
    console.log('[ШАГ 2] Меню. Кнопки:', this.getButtons(msg))

    // Step 3: registration (ReplyKeyboard)
    await this.sleep(800)
    console.log('\n[ШАГ 3] Отправляем: "' + BTN.REGISTER + '"')
    nextMsg = this.waitForMessage()
    await this.sendMessage(BTN.REGISTER)
    msg = await nextMsg
    console.log('[ШАГ 3] Response:', msg.text?.slice(0, 60))

    // Step 4: country of residence — skipped for already-registered users
    if (msg.text?.includes('страну проживания')) {
      console.log('[ШАГ 4] Selecting country of residence: Russia')
      await this.sleep(800)
      msg = await this.clickInlineButton(msg, 'Для жителей России')
      console.log('[ШАГ 4] TON VPN ответил:', msg.text?.slice(0, 80))
    } else {
      console.log('[ШАГ 4] SKIPPED — already registered, TON VPN went straight to:', msg.text?.slice(0, 60))
    }

    await this.sleep(800)
    console.log('\n[ШАГ 5] clickInlineButton: "' + BTN.OUTLINE + '"')
    msg = await this.clickInlineButton(msg, BTN.OUTLINE)
    console.log('[ШАГ 5] TON VPN ответил:', msg.text?.slice(0, 80))

    await this.sleep(800)
    console.log('\n[ШАГ 6] clickInlineButton: "' + BTN.UDP + '"')
    msg = await this.clickInlineButton(msg, BTN.UDP)
    console.log('[ШАГ 6] TON VPN ответил:', msg.text?.slice(0, 80))

    await this.sleep(800)
    console.log('\n[ШАГ 7] clickInlineButton: "' + countryBtn + '"')
    msg = await this.clickInlineButton(msg, countryBtn)
    console.log('[ШАГ 7] TON VPN ответил:', msg.text?.slice(0, 80))

    await this.sleep(800)
    console.log('\n[ШАГ 8] clickInlineButton: "' + periodBtn + '"')
    msg = await this.clickInlineButton(msg, periodBtn)
    console.log('[ШАГ 8] TON VPN ответил:', msg.text?.slice(0, 80))

    // Step 9: traffic — first available option
    const trafficRows = msg.replyMarkup?.rows || []
    const trafficBtns = trafficRows.flatMap(r => r.buttons)
    console.log('\n[ШАГ 9] Доступные варианты трафика:', trafficBtns.map(b => b.text))
    if (!trafficBtns.length) throw new Error('No traffic buttons in: ' + (msg.text || ''))
    console.log('[ШАГ 9] Выбираем: "' + trafficBtns[0].text + '"')
    msg = await this.clickInlineButton(msg, trafficBtns[0].text)
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
