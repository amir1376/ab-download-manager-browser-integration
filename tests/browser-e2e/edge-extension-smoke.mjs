import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {spawnSync} from "node:child_process"
import {fileURLToPath} from "node:url"
import {chromium} from "playwright-core"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const extensionPath = path.resolve(process.env.ABDM_EXTENSION_PATH || path.join(root, "dist/chrome"))
const edge = process.env.EDGE_BINARY || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const browserLabel = process.env.ABDM_BROWSER_LABEL || "Microsoft Edge"
if (!isFile(edge)) throw new Error(`Edge binary is unavailable: ${edge}`)
if (!isFile(path.join(extensionPath, "manifest.json"))) throw new Error(`Built extension is unavailable: ${extensionPath}`)

const output = path.join(root, "output/playwright", process.env.ABDM_RECEIPT_NAME || "edge-extension-smoke")
const nativeAuthorizedStoreId = "bbobopahenonfdgjgaleledndnnfhooj"
fs.mkdirSync(output, {recursive: true})
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "abdm-edge-profile-"))
const pageErrors = []
let context
let restoreNativeRegistration = () => {}

try {
  context = await launchEdge(profile)
  let worker = context.serviceWorkers()[0]
  if (!worker) worker = await context.waitForEvent("serviceworker", {timeout: 20_000})
  const workerUrl = new URL(worker.url())
  if (workerUrl.protocol !== "chrome-extension:") throw new Error(`Unexpected service worker URL: ${worker.url()}`)
  const extensionId = workerUrl.host
  if (process.env.ABDM_NATIVE_HOST && (extensionId !== nativeAuthorizedStoreId || process.env.ABDM_NATIVE_REGISTRY_KEY)) {
    await context.close()
    context = undefined
    await new Promise(resolve => setTimeout(resolve, 2_000))
    restoreNativeRegistration = registerNativeHost(extensionId, process.env.ABDM_NATIVE_HOST, process.env.ABDM_NATIVE_REGISTRY_KEY)
    await new Promise(resolve => setTimeout(resolve, 500))
    context = await launchEdge(profile)
    worker = context.serviceWorkers()[0]
    if (!worker) worker = await context.waitForEvent("serviceworker", {timeout: 20_000})
    if (new URL(worker.url()).host !== extensionId) throw new Error("Edge extension ID changed after native-host registration")
  }

  const page = await context.newPage()
  page.on("pageerror", error => pageErrors.push(error.message))
  await page.goto(`chrome-extension://${extensionId}/src/entrypoint/OptionUi/index.html`, {waitUntil: "domcontentloaded"})
  await page.locator("#app").waitFor({timeout: 20_000})
  await page.waitForTimeout(2_000)
  const manifest = await page.evaluate(() => chrome.runtime.getManifest())
  const commands = await page.evaluate(async () => await chrome.commands.getAll())
  const bodyText = await page.locator("body").innerText()
  let nativeStateVisible = bodyText.includes("Desktop browser policy is unavailable") ||
    bodyText.includes("Integration mode")
  if (process.env.ABDM_NATIVE_HOST && !bodyText.includes("Integration mode")) {
    await page.waitForTimeout(4_000)
    await page.reload({waitUntil: "domcontentloaded"})
    await page.waitForTimeout(1_000)
    nativeStateVisible = (await page.locator("body").innerText()).includes("Integration mode")
  }
  if (!bodyText.includes("AB Download Manager Extension")) throw new Error(`Options UI did not render: ${bodyText.slice(0, 500)}`)
  if (!nativeStateVisible) throw new Error(`Options UI did not expose native/policy state: ${bodyText.slice(0, 500)}`)
  if (process.env.ABDM_NATIVE_HOST && !(await page.locator("body").innerText()).includes("Integration mode")) {
    throw new Error("Edge did not connect through the temporary packaged native host")
  }
  if (manifest.version !== "1.6.0" || manifest.manifest_version !== 3) throw new Error("Loaded manifest identity mismatch")
  const commandNames = commands.map(command => command.name)
  for (const required of ["toggle-tab-bypass", "review-current-page"]) {
    if (!commandNames.includes(required)) throw new Error(`Missing browser command ${required}`)
  }
  await page.screenshot({path: path.join(output, "options.png"), fullPage: true})
  pageErrors.length = 0
  const cdp = await context.newCDPSession(page)
  await cdp.send("ServiceWorker.enable")
  await cdp.send("ServiceWorker.stopAllWorkers")
  await page.reload({waitUntil: "domcontentloaded"})
  await page.waitForTimeout(2_000)
  const workerRestartVerified = (await page.locator("body").innerText()).includes("Integration diagnostics") && pageErrors.length === 0
  if (!workerRestartVerified) throw new Error(`MV3 worker restart failed: ${pageErrors.join("; ")}`)

  await context.close()
  context = await launchEdge(profile)
  let restartedWorker = context.serviceWorkers()[0]
  if (!restartedWorker) restartedWorker = await context.waitForEvent("serviceworker", {timeout: 20_000})
  const restartPage = await context.newPage()
  restartPage.on("pageerror", error => pageErrors.push(error.message))
  pageErrors.length = 0
  await restartPage.goto(`chrome-extension://${new URL(restartedWorker.url()).host}/src/entrypoint/OptionUi/index.html`, {waitUntil: "domcontentloaded"})
  await restartPage.waitForTimeout(2_000)
  const browserRestartVerified = (await restartPage.locator("body").innerText()).includes("Integration diagnostics") && pageErrors.length === 0
  if (!browserRestartVerified) throw new Error(`Browser restart failed: ${pageErrors.join("; ")}`)

  const result = {
    schemaVersion: 1,
    status: "PASS",
    browser: browserLabel,
    browserVersion: context.browser()?.version() ?? null,
    extensionId,
    extensionVersion: manifest.version,
    manifestVersion: manifest.manifest_version,
    serviceWorkerUrl: worker.url(),
    commandNames,
    nativeStateVisible,
    packagedNativeHostConnected: Boolean(process.env.ABDM_NATIVE_HOST),
    workerRestartVerified,
    browserRestartVerified,
    pageErrors,
  }
  if (pageErrors.length) throw new Error(`Extension page errors: ${pageErrors.join("; ")}`)
  fs.writeFileSync(path.join(output, "receipt.json"), `${JSON.stringify(result, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} finally {
  await context?.close().catch(() => undefined)
  let restoreError
  try {
    restoreNativeRegistration()
  } catch (error) {
    restoreError = error
  }
  const resolvedProfile = path.resolve(profile)
  if (path.dirname(resolvedProfile) !== path.resolve(os.tmpdir()) || !path.basename(resolvedProfile).startsWith("abdm-edge-profile-")) {
    throw new Error(`Refusing to remove unexpected profile path: ${resolvedProfile}`)
  }
  fs.rmSync(resolvedProfile, {recursive: true, force: true})
  if (restoreError) throw restoreError
}

function isFile(value) {
  try {
    return fs.statSync(value).isFile()
  } catch {
    return false
  }
}

function launchEdge(profileDirectory) {
  return chromium.launchPersistentContext(profileDirectory, {
    executablePath: edge,
    headless: false,
    viewport: {width: 1280, height: 900},
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-mode",
    ],
  })
}

function registerNativeHost(extensionId, executable, registryKey) {
  if (process.platform !== "win32") throw new Error("Edge native-host registration smoke is Windows-only")
  if (!isFile(executable)) throw new Error(`Packaged native host is unavailable: ${executable}`)
  const key = registryKey || "HKCU\\SOFTWARE\\Microsoft\\Edge\\NativeMessagingHosts\\com.abdownloadmanager"
  const query = spawnSync("reg.exe", ["query", key, "/ve"], {encoding: "utf8", windowsHide: true})
  const original = query.status === 0 ? query.stdout.match(/REG_SZ\s+(.+)$/m)?.[1]?.trim() ?? null : null
  const manifest = path.join(output, "edge-native-manifest.json")
  fs.writeFileSync(manifest, `${JSON.stringify({
    name: "com.abdownloadmanager",
    description: "AB Download Manager packaged Edge smoke",
    path: executable,
    type: "stdio",
    allowed_origins: [`chrome-extension://${extensionId}/`],
  }, null, 2)}\n`)
  const installed = spawnSync("reg.exe", ["add", key, "/ve", "/t", "REG_SZ", "/d", manifest, "/f"], {encoding: "utf8", windowsHide: true})
  if (installed.status !== 0) throw new Error(`Could not register Edge native host: ${installed.stderr}`)
  return () => {
    const args = original
      ? ["add", key, "/ve", "/t", "REG_SZ", "/d", original, "/f"]
      : ["delete", key, "/f"]
    const restored = spawnSync("reg.exe", args, {encoding: "utf8", windowsHide: true})
    if (restored.status !== 0) throw new Error(`Could not restore Edge native-host registry state: ${restored.stderr}`)
  }
}
