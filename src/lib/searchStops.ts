export type BusStop = {
  id: string
  name: string
  lat: number
  lng: number
  vicinity?: string
}

type RawStop = BusStop & {
  kind: number
}

const DEDUPE_METERS = 180
const SEARCH_TIMEOUT_MS = 3500

const cache = new Map<string, BusStop[]>()
let localStopsPromise: Promise<BusStop[]> | null = null

function normalizeName(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()[\]（）·.]/g, '')
}

function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function relevance(query: string, name: string) {
  const q = normalizeName(query)
  const n = normalizeName(name)
  if (n === q) return 300
  if (n.startsWith(q)) return 200
  if (n.includes(q)) return 100
  return 0
}

function dedupeStops(stops: RawStop[], query: string): BusStop[] {
  const ranked = [...stops].sort((a, b) => {
    const rel = relevance(query, b.name) - relevance(query, a.name)
    if (rel !== 0) return rel
    return b.kind - a.kind
  })

  const kept: RawStop[] = []
  for (const stop of ranked) {
    const duplicate = kept.find(
      (other) =>
        normalizeName(other.name) === normalizeName(stop.name) &&
        distanceMeters(other, stop) <= DEDUPE_METERS,
    )
    if (duplicate) continue
    kept.push(stop)
  }

  const q = normalizeName(query)
  const exact = kept.filter((s) => normalizeName(s.name) === q)
  const strong = kept.filter((s) => normalizeName(s.name).startsWith(q))
  const chosen = exact.length > 0 ? exact : strong.length > 0 ? strong : kept

  return chosen.slice(0, 8).map(({ kind: _kind, ...stop }) => stop)
}

async function loadLocalStops(): Promise<BusStop[]> {
  if (!localStopsPromise) {
    localStopsPromise = fetch('/routes/stops.json')
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
  }
  return localStopsPromise
}

function searchLocal(stops: BusStop[], query: string): BusStop[] {
  const raw: RawStop[] = stops
    .filter((s) => relevance(query, s.name) > 0)
    .map((s) => ({ ...s, kind: 3 }))
  return dedupeStops(raw, query)
}

async function fetchJson<T>(
  url: string,
  signal: AbortSignal,
): Promise<T> {
  const res = await fetch(url, {
    signal,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'bus-root-viewer/1.0 (local transit map)',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}

function withTimeout(signal?: AbortSignal) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS)
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  }
}

async function searchPhoton(
  name: string,
  signal: AbortSignal,
): Promise<RawStop[]> {
  const q = encodeURIComponent(name)
  const url =
    `https://photon.komoot.io/api/?q=${q}&lat=37.45&lon=126.7&limit=10` +
    `&lang=ko&bbox=126.35,37.20,127.25,37.75`
  const data = await fetchJson<{
    features?: Array<{
      geometry: { coordinates: [number, number] }
      properties: {
        osm_id?: number
        name?: string
        city?: string
        district?: string
        county?: string
        type?: string
        osm_value?: string
      }
    }>
  }>(url, signal)

  const stops: RawStop[] = []
  for (const f of data.features ?? []) {
    const [lng, lat] = f.geometry.coordinates
    const p = f.properties
    const stopName = p.name?.trim()
    if (!stopName || relevance(name, stopName) === 0) continue
    const vicinity = [p.district, p.city, p.county].filter(Boolean).join(', ')
    stops.push({
      id: `ph-${p.osm_id ?? `${lat},${lng}`}`,
      name: stopName,
      lat,
      lng,
      vicinity: vicinity || undefined,
      kind: 1,
    })
  }
  return stops
}

export async function searchBusStops(
  name: string,
  signal?: AbortSignal,
): Promise<BusStop[]> {
  const trimmed = name.trim()
  if (trimmed.length < 2) return []

  const cacheKey = normalizeName(trimmed)
  const cached = cache.get(cacheKey)
  if (cached) return cached

  // Instant search against Incheon BIS stop index
  const local = searchLocal(await loadLocalStops(), trimmed)
  if (local.length > 0) {
    cache.set(cacheKey, local)
    return local
  }

  // Fallback to online geocoder
  const timeout = withTimeout(signal)
  try {
    const remote = await searchPhoton(trimmed, timeout.signal)
    const stops = dedupeStops(remote, trimmed)
    if (stops.length > 0) cache.set(cacheKey, stops)
    return stops
  } catch {
    return []
  } finally {
    timeout.clear()
  }
}
