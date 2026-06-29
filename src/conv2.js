const https = require("https")
const readline = require("readline")
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
function fetchConfig(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = ""
      res.on("data", chunk => data += chunk)
      res.on("end", () => { try { resolve(JSON.parse(data)) } catch(e) { reject(new Error("Parse error")) } })
    }).on("error", reject)
  })
}
async function convert(key) {
  const url = key.replace("ssconf://", "https://").split("#")[0]
  console.log("Fetching...")
  const d = await fetchConfig(url)
  const userInfo = Buffer.from(d.method + ":" + d.password).toString("base64url")
  const ssKey = "ss://" + userInfo + "@" + d.server + ":" + d.server_port + "#Octopus"
  console.log(ssKey)
}
rl.question("Key: ", async (input) => { rl.close(); try { await convert(input.trim()) } catch(e) { console.error(e.message) } })
