/**
 * Fetch official Incheon BIS route stop sequences and rebuild map geometries.
 *
 * Usage: node --env-file=.env scripts/fetch-incheon-routes.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import proj4 from 'proj4'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const API_KEY = process.env.INCHEON_API_KEY
if (!API_KEY) {
  console.error('Missing INCHEON_API_KEY in .env')
  process.exit(1)
}

/** Bessel TM mid (approx EPSG:5174) used by Incheon BIS POSX/POSY */
proj4.defs(
  'TM127',
  '+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +units=m +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43',
)

/** route number -> Incheon BIS routeId */
const ROUTE_IDS = {
  '103': '165000056',
  '112': '165000058',
  '1300': '165000149',
  '1301': '165000150',
  '1302': '165000421',
  '16': '165000020',
  '3-2': '165000310',
  '330': '165000509',
  '34': '165000033',
  '4': '165000004',
  // 4401 not found in public index — keep previous approx if any
  '521': '165000083',
  '522': '165000084',
  '523': '165000085',
  '65-1': '165000046',
  '6777': '161000002',
  '8': '165000012',
  '8A': '165000364',
  '9': '165000334',
  '9200': '165000161',
  '9201': '165000245',
  M6405: '165000215',
  M6450: '161000004',
  M6724: '165000381',
  급행99: '161000008',
  순환52: '168000030',
}

function tmToWgs(posx, posy) {
  const x = Number(posx)
  const y = Number(posy)
  if (!Number.isFinite(x) || !Number.isFinite(y) || (x === 0 && y === 0)) {
    return null
  }
  const [lng, lat] = proj4('TM127', 'WGS84', [x, y])
  return [lat, lng]
}

function parseItems(xml) {
  if (xml.includes('NO_OPENAPI_SERVICE_ERROR') || xml.includes('HTTP_ERROR')) {
    const msg = xml.match(/<returnAuthMsg>([^<]+)/)?.[1] ?? 'API error'
    throw new Error(msg)
  }
  const items = []
  const blocks = xml.split('<itemList>').slice(1)
  for (const block of blocks) {
    const get = (tag) => block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1] ?? ''
    items.push({
      routeId: get('ROUTEID'),
      stopId: get('BSTOPID'),
      shortId: get('SHORT_BSTOPID'),
      name: get('BSTOPNM'),
      admin: get('ADMINNM'),
      seq: Number(get('BSTOPSEQ') || 0),
      pathSeq: Number(get('PATHSEQ') || 0),
      dir: Number(get('DIRCD') || 0),
      posx: get('POSX'),
      posy: get('POSY'),
    })
  }
  return items
}

async function fetchSection(routeId) {
  const url =
    `https://apis.data.go.kr/6280000/busRouteService/getBusRouteSectionList` +
    `?serviceKey=${API_KEY}&pageNo=1&numOfRows=300&routeId=${routeId}`
  const res = await fetch(url, { headers: { Accept: 'application/xml' } })
  const xml = await res.text()
  return parseItems(xml)
}

function buildPolyline(items) {
  // Prefer outbound (DIRCD=0); if empty use all sorted by PATHSEQ
  const outbound = items.filter((i) => i.dir === 0)
  const ordered = (outbound.length >= 5 ? outbound : items).sort(
    (a, b) => a.pathSeq - b.pathSeq || a.seq - b.seq,
  )

  const poly = []
  const stops = []
  for (const item of ordered) {
    const ll = tmToWgs(item.posx, item.posy)
    if (!ll) continue
    poly.push(ll)
    stops.push({
      id: item.stopId,
      name: item.name,
      lat: ll[0],
      lng: ll[1],
      seq: item.seq,
      dir: item.dir,
      admin: item.admin,
    })
  }
  return { poly, stops }
}

async function osrmThrough(points) {
  if (points.length < 2) return points
  // Sample to keep URL short
  let coords = points
  if (coords.length > 40) {
    const step = Math.ceil(coords.length / 35)
    coords = coords.filter((_, i) => i % step === 0 || i === coords.length - 1)
  }

  const chunks = []
  for (let i = 0; i < coords.length - 1; i += 20) {
    const part = coords.slice(i, Math.min(i + 21, coords.length))
    if (part.length < 2) break
    chunks.push(part)
  }

  let merged = []
  for (const part of chunks) {
    const locs = part.map(([lat, lng]) => `${lng},${lat}`).join(';')
    const url = `https://router.project-osrm.org/route/v1/driving/${locs}?overview=full&geometries=geojson`
    const res = await fetch(url)
    const data = await res.json()
    if (data.code !== 'Ok') continue
    const seg = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng])
    merged = merged.length ? merged.concat(seg.slice(1)) : seg
    await new Promise((r) => setTimeout(r, 200))
  }
  return merged.length >= 2 ? merged : points
}

async function main() {
  const geometries = {}
  const stopIndex = []
  const routeStops = {}
  const seenStops = new Set()

  for (const [number, routeId] of Object.entries(ROUTE_IDS)) {
    process.stdout.write(`Fetching ${number} (${routeId})... `)
    try {
      const items = await fetchSection(routeId)
      const { poly, stops } = buildPolyline(items)
      if (poly.length < 2) {
        console.log('too few points')
        continue
      }
      const road = await osrmThrough(poly)
      geometries[number] = {
        source: 'incheon',
        routeId,
        polylines: [road],
        stopCount: stops.length,
      }
      routeStops[number] = stops
      for (const s of stops) {
        if (seenStops.has(s.id)) continue
        seenStops.add(s.id)
        stopIndex.push({
          id: s.id,
          name: s.name,
          lat: s.lat,
          lng: s.lng,
          vicinity: s.admin,
        })
      }
      console.log(`${stops.length} stops, ${road.length} path pts`)
    } catch (e) {
      console.log('FAIL', e.message)
    }
    await new Promise((r) => setTimeout(r, 250))
  }

  // Preserve previous approx for routes without BIS id (e.g. 4401)
  try {
    const prev = JSON.parse(
      await (await import('node:fs/promises')).readFile(
        join(ROOT, 'public/routes/geometries.json'),
        'utf8',
      ),
    )
    if (!geometries['4401'] && prev['4401']) {
      geometries['4401'] = prev['4401']
      console.log('kept previous 4401 geometry')
    }
  } catch {
    // ignore
  }

  mkdirSync(join(ROOT, 'public/routes'), { recursive: true })
  writeFileSync(
    join(ROOT, 'public/routes/geometries.json'),
    JSON.stringify(geometries),
  )
  writeFileSync(
    join(ROOT, 'public/routes/stops.json'),
    JSON.stringify(stopIndex),
  )
  writeFileSync(
    join(ROOT, 'public/routes/routeStops.json'),
    JSON.stringify(routeStops),
  )
  console.log(
    `\nWrote ${Object.keys(geometries).length} routes, ${stopIndex.length} unique stops`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
