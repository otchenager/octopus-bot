const https = require('https')

function fetchConfig(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(new Error('Failed to parse response')) }
      })
    }).on('error', reject)
  })
}

async function ssconfToSs(ssconfUrl) {
  const httpsUrl = ssconfUrl.replace('ssconf://', 'https://').split('#')[0]
  const d = await fetchConfig(httpsUrl)

  if (!d.server || !d.server_port || !d.password || !d.method) {
    throw new Error('Invalid config: ' + JSON.stringify(d))
  }

  const userInfo = Buffer.from(d.method + ':' + d.password).toString('base64url')
  return 'ss://' + userInfo + '@' + d.server + ':' + d.server_port + '#Octopus VPN'
}

module.exports = { ssconfToSs }
