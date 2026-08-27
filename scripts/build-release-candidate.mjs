import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import {execFileSync} from "node:child_process"
import {fileURLToPath} from "node:url"
import {createDeterministicZip} from "./deterministic-zip.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const outputArgument = process.argv.indexOf("--output-dir")
const outputDirectory = path.resolve(root, outputArgument >= 0 ? process.argv[outputArgument + 1] : "dist/release")
const allowDirty = process.argv.includes("--allow-dirty")
const status = git("status", "--porcelain", "--untracked-files=no")
if (status && !allowDirty) throw new Error("Release packaging requires a clean tracked worktree")

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
const protocolLock = JSON.parse(fs.readFileSync(path.join(root, "docs/browser-parity/PROTOCOL_LOCK.json"), "utf8"))
const commit = git("rev-parse", "HEAD")
const commitEpoch = Number(git("show", "-s", "--format=%ct", commit))
const commitTime = new Date(commitEpoch * 1000).toISOString()
fs.mkdirSync(outputDirectory, {recursive: true})

const artifacts = []
for (const browser of ["chrome", "firefox"]) {
  const input = path.join(root, "dist", browser)
  const manifestPath = path.join(input, "manifest.json")
  if (!fs.existsSync(manifestPath)) throw new Error(`Missing ${browser} build output`)
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  if (manifest.version !== packageJson.version) throw new Error(`${browser} manifest version does not match package.json`)
  const filename = `abdm-browser-extension-${browser}-${packageJson.version}.zip`
  const destination = path.join(outputDirectory, filename)
  const archive = createDeterministicZip(input, destination, commitEpoch)
  artifacts.push(describeArtifact(destination, filename, browser, manifest, archive.fileCount))
}

const sourceFilename = `abdm-browser-extension-source-${packageJson.version}.zip`
const sourcePath = path.join(outputDirectory, sourceFilename)
execFileSync("git", ["archive", "--format=zip", `--output=${sourcePath}`, commit], {cwd: root, stdio: "inherit"})
artifacts.push({
  name: sourceFilename,
  kind: "source",
  sha256: sha256(sourcePath),
  size: fs.statSync(sourcePath).size,
})

const attestation = {
  schemaVersion: 1,
  releaseCandidateId: `${commit.slice(0, 12)}-protocol-${protocolLock.protocolVersion}`,
  createdAt: commitTime,
  source: {
    repository: packageJson.repository,
    branch: git("branch", "--show-current"),
    commit,
    cleanTrackedWorktree: status.length === 0,
  },
  extensionVersion: packageJson.version,
  protocol: {
    version: protocolLock.protocolVersion,
    schemaSha256: protocolLock.schemaSha256,
  },
  reproducibility: {
    sourceDateEpoch: commitEpoch,
    sortedUtf8Paths: true,
    fixedEntryTimestamps: true,
    compression: "deflate-raw-level-9",
  },
  artifacts,
  externalGates: {
    signedStorePackages: "NOT_RUN",
    installedBrowserNativeDesktopMatrix: "NOT_RUN",
    humanLocaleReview: "NOT_RUN",
  },
}
const attestationPath = path.join(outputDirectory, "release-attestation.json")
fs.writeFileSync(attestationPath, `${JSON.stringify(attestation, null, 2)}\n`)
const sums = [...artifacts, {name: "release-attestation.json", sha256: sha256(attestationPath)}]
  .map(value => `${value.sha256}  ${value.name}`).join("\n")
fs.writeFileSync(path.join(outputDirectory, "SHA256SUMS"), `${sums}\n`)
process.stdout.write(`${JSON.stringify(attestation, null, 2)}\n`)

function describeArtifact(file, name, browser, manifest, fileCount) {
  return {
    name,
    kind: "extension",
    browser,
    manifestVersion: manifest.manifest_version,
    extensionVersion: manifest.version,
    manifestSha256: sha256(path.join(root, "dist", browser, "manifest.json")),
    sha256: sha256(file),
    size: fs.statSync(file).size,
    fileCount,
  }
}

function git(...args) {
  return execFileSync("git", args, {cwd: root, encoding: "utf8"}).trim()
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
}
