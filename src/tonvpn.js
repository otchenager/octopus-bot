require('dotenv').config()

const { TelegramClient } = require('telegram')
const { StringSession } = require('telegram/sessions')
const { NewMessage } = require('telegram/events')

const TON_VPN_BOT = '@TonVPN_bot'
const BOT_USERNAME = 'tonvpn_bot'

const COUNTRY_CODES = {
  '🇦🇺 Австралия':  'au',
  '🇬🇧 Англия':     'gb',
  '🇻🇳 Вьетнам':    'vn',
  '🇩🇪 Германия':   'de',
  '🇭🇰 Гонконг':    'hk',
  '🇨🇦 Канада':     'ca',
  '🇱🇹 Литва':      'lt',
  '🇳🇱 Нидерланды': 'nl',
  '🇦🇪 ОАЭ':        'ae',
  '🇵🇱 Польша':     'pl',
  '🇷🇺 Россия':     'ru',
  '🇺🇸 США':        'us',
  '🇸🇬 Сингапур':   'sg',
  '🇹🇷 Турция':     'tr',
  '🇺🇦 Украина':    'ua',
  '🇫🇮 Финляндия':  'fi',
  '🇫🇷 Франция':    'fr',
  '🇸🇪 Швеция':     'se',
  '🇯🇵 Япония':     'jp',
}

const PERIOD_CODES = {
  '1d':  '1',
  '1m':  '30',
  '3m':  '90',
  '1y':  '365',
  '2y':  '730',
  '3y':  '1095',
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

      let GlobalEditedMessage
      try {
        GlobalEditedMessage = require('telegram/events/EditedMessage').EditedMessage
      } catch(e) {}
      if (!GlobalEditedMessage) {
        try {
          GlobalEditedMessage = require('telegram/events').EditedMessage
        } catch(e) {}
      }

      const logHandler = async (event) => {
        try {
          const msg = event.message
          const sender = await msg.getSender()
          if (sender?.username?.toLowerCase() !== BOT_USERNAME) return

          console.log('\n=== TON VPN INCOMING (type: ' + event.constructor.name + ') ===')
          console.log('text:', msg.text)
          console.log('replyMarkup type:', msg.replyMarkup?.className)

          if (msg.replyMarkup?.rows) {
            for (const row of msg.replyMarkup.rows) {
              for (const btn of row.buttons) {
                const raw = btn.data?.data ?? btn.data
                const decoded = raw ? Buffer.from(raw).toString('utf8') : 'NO_DATA'
                console.log(`  [${btn.className}] "${btn.text}" → "${decoded}"`)
              }
            }
          } else {
            console.log('replyMarkup:', JSON.stringify(msg.replyMarkup))
          }
          console.log('=== END ===\n')
        } catch(e) {}
      }

      this.client.addEventHandler(logHandler, new NewMessage({}))
      if (GlobalEditedMessage) {
        this.client.addEventHandler(logHandler, new GlobalEditedMessage({}))
        console.log('EditedMessage handler added')
      } else {
        console.log('EditedMessage not available in this GramJS version')
      }
    }
  }

  waitForNewMessage(timeout = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.client.removeEventHandler(handler)
        reject(new Error('TON VPN timeout (NewMessage)'))
      }, timeout)

      const handler = async (event) => {
        try {
          const msg = event.message
          const sender = await msg.getSender()
          if (sender?.username?.toLowerCase() === BOT_USERNAME) {
            console.log('[NEW MSG] from tonvpn_bot:', msg.text?.slice(0, 60))
            clearTimeout(timer)
            this.client.removeEventHandler(handler)
            resolve(msg)
          }
        } catch(_) {}
      }

      this.client.addEventHandler(handler, new NewMessage({}))
    })
  }

  waitForEditedMessage(timeout = 15000) {
    return new Promise((resolve, reject) => {
      let EditedMessage
      try {
        EditedMessage = require('telegram/events/EditedMessage').EditedMessage
      } catch(e) {}
      if (!EditedMessage) {
        try {
          EditedMessage = require('telegram/events').EditedMessage
        } catch(e) {}
      }

      if (!EditedMessage) {
        reject(new Error('EditedMessage not available in this GramJS version'))
        return
      }

      const timer = setTimeout(() => {
        this.client.removeEventHandler(handler)
        reject(new Error('TON VPN timeout (EditedMessage)'))
      }, timeout)

      const handler = async (event) => {
        try {
          const msg = event.message
          const sender = await msg.getSender()
          if (sender?.username?.toLowerCase() === BOT_USERNAME) {
            console.log('[EDIT MSG] from tonvpn_bot:', msg.text?.slice(0, 60))
            clearTimeout(timer)
            this.client.removeEventHandler(handler)
            resolve(msg)
          }
        } catch(_) {}
      }

      this.client.addEventHandler(handler, new EditedMessage({}))
    })
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

    const countryCode = COUNTRY_CODES[country]
    if (!countryCode) throw new Error('Unknown country: ' + country)

    const periodCode = PERIOD_CODES[period]
    if (!periodCode) throw new Error('Unknown period: ' + period)

    console.log('\n=== GETTING KEY ===')
    console.log('Country:', country, '->', countryCode)
    console.log('Period:', period, '->', periodCode)

    // Step 1: /start + trigger menu
    await this.sendMessage('/start')
    await this.waitForNewMessage()
    await this.sleep(500)
    await this.sendMessage('Привет')
    await this.waitForNewMessage()
    await this.sleep(500)

    // Step 2: Registration
    await this.sendMessage('🧞‍♂️Регистрация нового пользователя')
    const step2 = await this.waitForNewMessage()
    await this.sleep(500)

    // Step 3: Country of residence (may be skipped for existing users)
    if (step2.text?.includes('страну проживания')) {
      await this.sendMessage('/resident_in-russia')
      await this.waitForEditedMessage()
      await this.sleep(500)
    }

    // Step 4: Protocol (Outline)
    await this.sendMessage('/choose_port_type-russia-outline')
    await this.waitForEditedMessage()
    await this.sleep(500)

    // Step 5: Port (UDP)
    await this.sendMessage('/new_client_setup-russia-outline-udp')
    await this.waitForEditedMessage()
    await this.sleep(500)

    // Step 6: Server country
    await this.sendMessage(`/get_access_key_plan_type-${countryCode}-russia-outline-udp`)
    await this.waitForEditedMessage()
    await this.sleep(500)

    // Step 7: Period
    await this.sendMessage(`/get_access_key_plan-${periodCode}-${countryCode}-russia-outline-udp`)
    await this.waitForEditedMessage()
    await this.sleep(500)

    // Step 8: Traffic — always minimum (50GB)
    await this.sendMessage(`/create_access_key-1-${countryCode}-russia-outline-udp`)

    // Wait for key message (NewMessage with ssconf://)
    const keyMsg = await this.waitForNewMessage(15000)
    console.log('[KEY MSG]', keyMsg.text)

    const ssconfKey = this.extractKey(keyMsg.text || '')
    if (!ssconfKey) throw new Error('Key not found in: ' + keyMsg.text)

    console.log('=== KEY RECEIVED:', ssconfKey, '===')
    return ssconfKey
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
