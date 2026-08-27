import {createHash} from "node:crypto"
import {readFile} from "node:fs/promises"
import path from "node:path"
import {fileURLToPath} from "node:url"

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const lock = JSON.parse(await readFile(path.join(repositoryRoot, "docs/browser-parity/PROTOCOL_LOCK.json"), "utf8"))

async function sha256(relativePath) {
    return createHash("sha256")
        .update(await readFile(path.join(repositoryRoot, relativePath)))
        .digest("hex")
}

const schemaHash = await sha256(lock.vendoredSchema)
if (schemaHash !== lock.schemaSha256) {
    throw new Error(`Vendored schema hash mismatch: expected=${lock.schemaSha256} actual=${schemaHash}`)
}

const typescriptHash = await sha256(lock.generatedTypescript)
if (typescriptHash !== lock.generatedTypescriptSha256) {
    throw new Error(`Generated TypeScript hash mismatch: expected=${lock.generatedTypescriptSha256} actual=${typescriptHash}`)
}

process.stdout.write(`PROTOCOL_LOCK_OK version=${lock.protocolVersion.major}.${lock.protocolVersion.minor} schema=${schemaHash}\n`)
