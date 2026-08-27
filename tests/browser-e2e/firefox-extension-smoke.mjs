import fs from "node:fs"
import path from "node:path"
import {spawn, spawnSync} from "node:child_process"
import {fileURLToPath} from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const extensionPath = path.resolve(process.env.ABDM_EXTENSION_PATH || path.join(root, "dist/firefox"))
const firefox = process.env.FIREFOX_BINARY || findFirefox()
if (!firefox) throw new Error("Firefox binary is unavailable")
if (!fs.existsSync(path.join(extensionPath, "manifest.json"))) throw new Error(`Built extension is unavailable: ${extensionPath}`)
const webExt = path.join(root, "node_modules/web-ext/bin/web-ext.js")
const version = spawnSync(firefox, ["--version"], {encoding: "utf8"})
const browserVersion = `${version.stdout || ""}\n${version.stderr || ""}`.match(/Firefox\s+([^\s]+)/i)?.[1] ?? null
const output = path.join(root, "output/playwright/firefox-extension-smoke")
fs.mkdirSync(output, {recursive: true})
const holdMilliseconds = Math.min(30_000, Math.max(1_000, Number(process.env.ABDM_SMOKE_HOLD_MS || 3_000)))

const lines = []
let installed = false
const child = spawn(process.execPath, [
  webExt, "run",
  "--firefox-binary", firefox,
  "--source-dir", extensionPath,
  "--no-reload",
  "--arg=-headless",
  "--start-url=about:blank",
], {cwd: root, windowsHide: true})
child.stdout.setEncoding("utf8")
child.stderr.setEncoding("utf8")
child.stdout.on("data", onOutput)
child.stderr.on("data", onOutput)

const status = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    child.kill()
    reject(new Error(`Firefox temporary add-on did not install:\n${lines.join("")}`))
  }, 45_000)
  child.on("error", reject)
  child.on("exit", (code, signal) => {
    clearTimeout(timeout)
    if (!installed) reject(new Error(`Firefox exited before installation (${code}/${signal}):\n${lines.join("")}`))
    else resolve({code, signal})
  })
})

const receipt = {
  schemaVersion: 1,
  status: "PASS",
  browser: "Mozilla Firefox",
  browserVersion,
  extensionVersion: JSON.parse(fs.readFileSync(path.join(extensionPath, "manifest.json"), "utf8")).version,
  temporaryAddOnInstalled: installed,
  processExit: status,
}
fs.writeFileSync(path.join(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`)
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)

function onOutput(chunk) {
  lines.push(chunk)
  if (!installed && chunk.includes("as a temporary add-on")) {
    installed = true
    setTimeout(() => child.kill(), holdMilliseconds)
  }
}

function findFirefox() {
  const candidates = process.platform === "win32" ? [
    "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
    "C:\\Program Files\\Firefox Developer Edition\\firefox.exe",
  ] : process.platform === "darwin" ? [
    "/Applications/Firefox.app/Contents/MacOS/firefox",
    "/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox",
  ] : ["/usr/bin/firefox", "/snap/bin/firefox"]
  return candidates.find(candidate => fs.existsSync(candidate)) ?? null
}
