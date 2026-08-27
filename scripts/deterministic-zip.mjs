import fs from "node:fs"
import path from "node:path"
import {deflateRawSync} from "node:zlib"
import {fileURLToPath} from "node:url"

export function createDeterministicZip(inputDirectory, outputFile, epochSeconds) {
  const input = path.resolve(inputDirectory)
  const files = collectFiles(input)
  const {date, time} = dosDateTime(epochSeconds)
  const localParts = []
  const centralParts = []
  let offset = 0

  for (const relativePath of files) {
    const absolutePath = path.join(input, ...relativePath.split("/"))
    const source = fs.readFileSync(absolutePath)
    const compressed = deflateRawSync(source, {level: 9})
    const name = Buffer.from(relativePath, "utf8")
    const crc = crc32(source)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(source.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    localParts.push(local, name, compressed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(0x031e, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(source.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE((0o100644 * 0x10000) >>> 0, 38)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, name)
    offset += local.length + name.length + compressed.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  fs.mkdirSync(path.dirname(outputFile), {recursive: true})
  fs.writeFileSync(outputFile, Buffer.concat([...localParts, centralDirectory, end]))
  return {fileCount: files.length, size: fs.statSync(outputFile).size}
}

function collectFiles(directory, relative = "") {
  const entries = fs.readdirSync(path.join(directory, relative), {withFileTypes: true})
  const files = []
  for (const entry of entries) {
    const child = relative ? `${relative}/${entry.name}` : entry.name
    if (entry.isSymbolicLink()) throw new Error(`Release input contains symbolic link: ${child}`)
    if (entry.isDirectory()) files.push(...collectFiles(directory, child))
    else if (entry.isFile()) files.push(child.replaceAll("\\", "/"))
    else throw new Error(`Release input contains unsupported entry: ${child}`)
  }
  return files.sort((left, right) => Buffer.from(left).compare(Buffer.from(right)))
}

function dosDateTime(epochSeconds) {
  const value = new Date(Math.max(epochSeconds * 1000, Date.UTC(1980, 0, 1)))
  const year = Math.min(2107, Math.max(1980, value.getUTCFullYear()))
  return {
    date: ((year - 1980) << 9) | ((value.getUTCMonth() + 1) << 5) | value.getUTCDate(),
    time: (value.getUTCHours() << 11) | (value.getUTCMinutes() << 5) | Math.floor(value.getUTCSeconds() / 2),
  }
}

const CRC_TABLE = Array.from({length: 256}, (_, value) => {
  let current = value
  for (let bit = 0; bit < 8; bit++) current = (current & 1) ? (0xedb88320 ^ (current >>> 1)) : (current >>> 1)
  return current >>> 0
})

function crc32(buffer) {
  let value = 0xffffffff
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , inputDirectory, outputFile, epoch = "315532800"] = process.argv
  if (!inputDirectory || !outputFile) throw new Error("Usage: deterministic-zip.mjs <input-directory> <output-file> [epoch-seconds]")
  const result = createDeterministicZip(inputDirectory, outputFile, Number(epoch))
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
