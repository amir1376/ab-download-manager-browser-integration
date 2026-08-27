import fs from "node:fs"
import path from "node:path"

const root = path.resolve(process.argv[2] || ".")
const attestations = find(root, "release-attestation.json").map(file => ({file, value: JSON.parse(fs.readFileSync(file, "utf8"))}))
if (attestations.length < 2) throw new Error(`Expected at least two release attestations below ${root}`)
const baseline = identity(attestations[0].value)
for (const candidate of attestations.slice(1)) {
  const value = identity(candidate.value)
  if (JSON.stringify(value) !== JSON.stringify(baseline)) {
    throw new Error(`Cross-platform release mismatch between ${attestations[0].file} and ${candidate.file}`)
  }
}
process.stdout.write(`${JSON.stringify({status: "PASS", attestationCount: attestations.length, identity: baseline}, null, 2)}\n`)

function identity(attestation) {
  return {
    sourceCommit: attestation.source.commit,
    extensionVersion: attestation.extensionVersion,
    protocol: attestation.protocol,
    artifacts: attestation.artifacts.map(artifact => ({name: artifact.name, sha256: artifact.sha256, size: artifact.size})),
  }
}

function find(directory, name) {
  const found = []
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const value = path.join(directory, entry.name)
    if (entry.isDirectory()) found.push(...find(value, name))
    else if (entry.isFile() && entry.name === name) found.push(value)
  }
  return found.sort()
}
