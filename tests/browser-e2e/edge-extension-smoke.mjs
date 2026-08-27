import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {chromium} from "playwright-core"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const extensionPath = path.resolve(process.env.ABDM_EXTENSION_PATH || path.join(root, "dist/chrome"))
const edge = process.env.EDGE_BINARY || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
if (!isFile(edge)) throw new Error(`Edge binary is unavailable: ${edge}`)
if (!isFile(path.join(extensionPath, "manifest.json"))) throw new Error(`Built extension is unavailable: ${extensionPath}`)

const output = path.join(root, "output/playwright/edge-extension-smoke")
fs.mkdirSync(output, {recursive: true})
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "abdm-edge-profile-"))
const pageErrors = []
let context

try {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: edge,
    headless: false,
    viewport: {width: 1280, height: 900},
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-first-run",
      "--no-default-browser-check",
    ],
  })
  let worker = context.serviceWorkers()[0]
  if (!worker) worker = await context.waitForEvent("serviceworker", {timeout: 20_000})
  const workerUrl = new URL(worker.url())
  if (workerUrl.protocol !== "chrome-extension:") throw new Error(`Unexpected service worker URL: ${worker.url()}`)
  const extensionId = workerUrl.host

  const page = await context.newPage()
  page.on("pageerror", error => pageErrors.push(error.message))
  await page.goto(`chrome-extension://${extensionId}/src/entrypoint/OptionUi/index.html`, {waitUntil: "domcontentloaded"})
  await page.locator("#app").waitFor({timeout: 20_000})
  await page.waitForTimeout(2_000)
  const manifest = await page.evaluate(() => chrome.runtime.getManifest())
  const commands = await page.evaluate(async () => await chrome.commands.getAll())
  const bodyText = await page.locator("body").innerText()
  const nativeStateVisible = bodyText.includes("Desktop browser policy is unavailable") ||
    bodyText.includes("Integration mode")
  if (!bodyText.includes("AB Download Manager Extension")) throw new Error(`Options UI did not render: ${bodyText.slice(0, 500)}`)
  if (!nativeStateVisible) throw new Error(`Options UI did not expose native/policy state: ${bodyText.slice(0, 500)}`)
  if (manifest.version !== "1.6.0" || manifest.manifest_version !== 3) throw new Error("Loaded manifest identity mismatch")
  const commandNames = commands.map(command => command.name)
  for (const required of ["toggle-tab-bypass", "review-current-page"]) {
    if (!commandNames.includes(required)) throw new Error(`Missing browser command ${required}`)
  }
  await page.screenshot({path: path.join(output, "options.png"), fullPage: true})
  const result = {
    schemaVersion: 1,
    status: "PASS",
    browser: "Microsoft Edge",
    browserVersion: context.browser()?.version() ?? null,
    extensionId,
    extensionVersion: manifest.version,
    manifestVersion: manifest.manifest_version,
    serviceWorkerUrl: worker.url(),
    commandNames,
    nativeStateVisible,
    pageErrors,
  }
  if (pageErrors.length) throw new Error(`Extension page errors: ${pageErrors.join("; ")}`)
  fs.writeFileSync(path.join(output, "receipt.json"), `${JSON.stringify(result, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} finally {
  await context?.close().catch(() => undefined)
  const resolvedProfile = path.resolve(profile)
  if (path.dirname(resolvedProfile) !== path.resolve(os.tmpdir()) || !path.basename(resolvedProfile).startsWith("abdm-edge-profile-")) {
    throw new Error(`Refusing to remove unexpected profile path: ${resolvedProfile}`)
  }
  fs.rmSync(resolvedProfile, {recursive: true, force: true})
}

function isFile(value) {
  try {
    return fs.statSync(value).isFile()
  } catch {
    return false
  }
}
