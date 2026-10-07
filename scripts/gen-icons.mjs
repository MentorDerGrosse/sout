// Renders resources/icon.png (app) and resources/tray*.png (top bar) without any image library.
// The artwork matches the <Logo> SVG in src/renderer/src/components.tsx (64×64 grid).
// Usage: npm run icons
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources')

// Signed distance to a rounded rectangle (negative inside).
function roundRect(px, py, x0, y0, x1, y1, r) {
  const qx = Math.abs(px - (x0 + x1) / 2) - ((x1 - x0) / 2 - r)
  const qy = Math.abs(py - (y0 + y1) / 2) - ((y1 - y0) / 2 - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

// Distance to a line segment.
function segment(px, py, ax, ay, bx, by) {
  const [dx, dy, ex, ey] = [px - ax, py - ay, bx - ax, by - ay]
  const t = Math.max(0, Math.min(1, (dx * ex + dy * ey) / (ex * ex + ey * ey)))
  return Math.hypot(dx - ex * t, dy - ey * t)
}

/** White calendar with a check mark. */
function inGlyph(x, y) {
  const body = roundRect(x, y, 15, 17, 49, 49, 6)
  return (
    Math.abs(body) <= 2 || // outline, 4 wide
    (body <= 0 && y <= 28) || // header band
    roundRect(x, y, 22, 12, 26, 21, 2) <= 0 || // rings
    roundRect(x, y, 38, 12, 42, 21, 2) <= 0 ||
    segment(x, y, 24, 37, 29, 42) <= 2 || // check mark
    segment(x, y, 29, 42, 40, 31) <= 2
  )
}

const inBackground = (x, y) => roundRect(x, y, 2, 2, 62, 62, 14) <= 0
const mix = (a, b, t) => Math.round(a + (b - a) * t)

function render(size, { background, scale }) {
  const samples = 4 // supersampling per axis for smooth edges
  const rgba = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let glyph = 0
      let bg = 0
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = ((px + (sx + 0.5) / samples) / size) * 64
          const y = ((py + (sy + 0.5) / samples) / size) * 64
          if (inGlyph(32 + (x - 32) / scale, 31.5 + (y - 32) / scale)) glyph++
          if (background && inBackground(x, y)) bg++
        }
      }
      const g = glyph / samples ** 2
      const i = (py * size + px) * 4
      if (background) {
        const t = py / (size - 1) // vertical gradient #4d8af0 → #2b5fd9
        rgba[i] = mix(mix(0x4d, 0x2b, t), 255, g)
        rgba[i + 1] = mix(mix(0x8a, 0x5f, t), 255, g)
        rgba[i + 2] = mix(mix(0xf0, 0xd9, t), 255, g)
        rgba[i + 3] = Math.round((bg / samples ** 2) * 255)
      } else {
        rgba.fill(255, i, i + 3)
        rgba[i + 3] = Math.round(g * 255)
      }
    }
  }
  return encodePng(size, rgba)
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(size, rgba) {
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size) // each row: filter byte 0 + pixels
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 6, 0, 0, 0], 8) // 8 bit, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

mkdirSync(outDir, { recursive: true })
const icons = {
  'icon.png': render(256, { background: true, scale: 1 }),
  // White glyph without background, as usual for icons in GNOME's dark top bar.
  'tray.png': render(32, { background: false, scale: 1.5 }),
  'tray@2x.png': render(64, { background: false, scale: 1.5 })
}
for (const [name, png] of Object.entries(icons)) {
  writeFileSync(join(outDir, name), png)
  console.log(`resources/${name}`)
}
