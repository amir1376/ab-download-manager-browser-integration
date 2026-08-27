import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const directories = process.argv.slice(2).map(value => path.resolve(value))
if (directories.length < 2) throw new Error("Usage: compare-release-directories.mjs <release-dir> <release-dir> [...]")
const baseline = inventory(directories[0])
for (const directory of directories.slice(1)) {
  const candidate = inventory(directory)
  if (JSON.stringify(candidate) !== JSON.stringify(baseline)) {
    process.stderr.write(`${JSON.stringify({baseline: directories[0], candidate: directory, baselineFiles: baseline, candidateFiles: candidate}, null, 2)}\n`)
    throw new Error(`Release output differs: ${directory}`)
  }
}
process.stdout.write(`${JSON.stringify({status: "PASS", directories, files: baseline}, null, 2)}\n`)

function inventory(directory) {
  return fs.readdirSync(directory, {withFileTypes: true})
    .filter(entry => entry.isFile())
    .map(entry => {
      const file = path.join(directory, entry.name)
      return {name: entry.name, size: fs.statSync(file).size, sha256: sha256(file)}
    })
    .sort((left, right) => left.name.localeCompare(right.name))
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
}
