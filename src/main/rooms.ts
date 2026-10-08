import { readFileSync } from 'node:fs'
import type { RoomInfo } from '../shared/types'
import { resourcePath } from './paths'

// TU Wien rooms by their TISS name, from better-tiss-calendar (MIT, see rooms.LICENSE):
// resources/rooms.csv – name, seats, institute, booking, status, building, address, TUW-Maps code,
// TISS room page; resources/lecturetube.csv – codes of the rooms with a LectureTube live stream.

let rooms: Map<string, RoomInfo> | null = null

export function roomInfo(name: string): RoomInfo | null {
  rooms ??= loadRooms()
  return rooms.get(name.trim()) ?? null
}

function loadRooms(): Map<string, RoomInfo> {
  const result = new Map<string, RoomInfo>()
  const streamed = lectureTubeRooms()
  try {
    for (const [name, , , , , , address, mapCode] of parseCsv(readFileSync(resourcePath('rooms.csv'), 'utf8'))) {
      if (!name || !mapCode) continue
      const code = mapCode.trim()
      result.set(name.trim(), {
        address: (address ?? '').replace(/,\s*$/, '').trim(),
        mapCode: code,
        lectureTube: streamed.has(code) ? `https://live.video.tuwien.ac.at/room/${encodeURIComponent(code)}/player.html` : null
      })
    }
  } catch {
    // Without the list, room links fall back to a name search.
  }
  return result
}

function lectureTubeRooms(): Set<string> {
  try {
    return new Set(readFileSync(resourcePath('lecturetube.csv'), 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean))
  } catch {
    return new Set()
  }
}

/** Comma separated values with optional double quotes ("" inside quotes is a quote). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field || row.length) rows.push([...row, field])
  return rows
}
