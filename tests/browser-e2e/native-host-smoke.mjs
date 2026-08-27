import fs from "node:fs"
import path from "node:path"
import {spawn} from "node:child_process"
import {fileURLToPath} from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const executable = process.env.ABDM_NATIVE_HOST
if (!executable || !fs.existsSync(executable)) throw new Error("Set ABDM_NATIVE_HOST to the packaged native-host executable")
const output = path.join(root, "output/playwright/native-host-smoke")
fs.mkdirSync(output, {recursive: true})

const child = spawn(executable, [], {stdio: ["pipe", "pipe", "pipe"], windowsHide: true})
let stdout = Buffer.alloc(0)
let stderr = ""
const replies = new Map()
child.stderr.setEncoding("utf8")
child.stderr.on("data", value => { stderr = `${stderr}${value}`.slice(-16_384) })
child.stdout.on("data", value => {
  stdout = Buffer.concat([stdout, value])
  while (stdout.length >= 4) {
    const length = stdout.readUInt32LE(0)
    if (length > 256 * 1024) throw new Error(`Native host emitted oversized frame: ${length}`)
    if (stdout.length < length + 4) break
    const frame = JSON.parse(stdout.subarray(4, length + 4).toString("utf8"))
    stdout = stdout.subarray(length + 4)
    const pending = replies.get(frame.id)
    if (pending) {
      replies.delete(frame.id)
      pending.resolve(frame)
    }
  }
})

try {
  const helloResponse = await request("helloV2", null)
  const hello = parsePayload(helloResponse)
  if (hello.capabilities?.protocolVersion?.major !== 2) throw new Error("Packaged native host did not negotiate protocol v2")
  if (typeof hello.httpFallback?.apiKey !== "string" || hello.httpFallback.apiKey.length < 16) {
    throw new Error("Packaged native host did not return an authenticated HTTP fallback")
  }
  const policy = parsePayload(await request("getPolicyV2", null))
  if (policy.schemaVersion !== 2 || !["OFF", "STANDARD", "FULL"].includes(policy.mode)) {
    throw new Error("Packaged desktop returned an invalid browser policy")
  }
  await request("ping", null)
  const receipt = {
    schemaVersion: 1,
    status: "PASS",
    nativeHost: path.basename(executable),
    protocolVersion: hello.capabilities.protocolVersion,
    desktopVersion: hello.capabilities.desktopVersion,
    supportedTransports: hello.capabilities.supportedTransports,
    supportedSchemes: hello.capabilities.supportedSchemes,
    featureFlags: hello.capabilities.featureFlags,
    httpFallback: {
      baseUrl: hello.httpFallback.baseUrl,
      headerName: hello.httpFallback.headerName,
      authenticatedSecretPresent: true,
    },
    policy: {schemaVersion: policy.schemaVersion, revision: policy.revision, mode: policy.mode},
    secretMaterialPersisted: false,
  }
  fs.writeFileSync(path.join(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)
} finally {
  for (const pending of replies.values()) pending.reject(new Error("Native host closed"))
  replies.clear()
  child.stdin.end()
  await Promise.race([
    new Promise(resolve => child.once("exit", resolve)),
    new Promise(resolve => setTimeout(resolve, 3_000)),
  ])
  if (!child.killed) child.kill()
}

function request(action, payload) {
  const id = `B_SMOKE_${crypto.randomUUID().replaceAll("-", "")}`
  const message = Buffer.from(JSON.stringify({
    id,
    content: {action, isError: false, payload: JSON.stringify(payload)},
  }), "utf8")
  const header = Buffer.alloc(4)
  header.writeUInt32LE(message.length)
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      replies.delete(id)
      reject(new Error(`Native request timed out: ${action}; stderr=${redact(stderr)}`))
    }, 20_000)
    replies.set(id, {
      resolve: value => { clearTimeout(timeout); resolve(value) },
      reject: error => { clearTimeout(timeout); reject(error) },
    })
    child.stdin.write(Buffer.concat([header, message]))
  })
}

function parsePayload(response) {
  if (response.content?.isError) throw new Error(`Native host returned a safe error for ${response.id}`)
  return JSON.parse(response.content.payload)
}

function redact(value) {
  return value.replace(/https?:\/\/\S+/g, "[URL]").replace(/[A-Fa-f0-9]{32,}/g, "[SECRET]").slice(-2_000)
}
