const { TelegramClient } = require('telegram')
const { StringSession } = require('telegram/sessions')
const input = require('input')

const apiId = 2040
const apiHash = 'b18441a1ff607e10a989891a5462e627'

;(async () => {
  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 5
  })

  await client.start({
    phoneNumber: async () => await input.text('Номер телефона (+7...): '),
    password: async () => await input.text('Пароль 2FA (если есть): '),
    phoneCode: async () => await input.text('Код из Telegram: '),
    onError: (err) => console.error(err)
  })

  console.log('\nДобавь в .env:')
  console.log('SESSION_STRING=' + client.session.save())

  await client.disconnect()
})()