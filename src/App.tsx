import {
  useEffect,
  useMemo,
  useState,
  useEffectEvent,
  useRef,
  type CSSProperties,
  type FormEvent,
} from 'react'
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  ZoomControl,
  ScaleControl,
  Marker,
  Tooltip,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import { BUS_ROUTES } from './data/routes'
import { searchBusStops, type BusStop } from './lib/searchStops'
import './App.css'

type GeometryEntry = {
  source: 'incheon' | 'osm' | 'approx'
  polylines: [number, number][][]
  routeId?: string
  stopCount?: number
}

type RouteStop = {
  id: string
  name: string
  lat: number
  lng: number
  seq: number
  dir: number
  admin?: string
}

type Geometries = Record<string, GeometryEntry>
type RouteStopsMap = Record<string, RouteStop[]>

type ActiveRoute = {
  id: string
  color: string
  positions: [number, number][]
  number: string
  approx: boolean
  origin: string
  destination: string
}

function pointAlong(
  positions: [number, number][],
  t: number,
): [number, number] {
  if (positions.length === 1) return positions[0]
  const idx = Math.min(
    positions.length - 1,
    Math.max(0, Math.round(t * (positions.length - 1))),
  )
  return positions[idx]
}

function sampleStops(
  positions: [number, number][],
  maxStops = 14,
): [number, number][] {
  if (positions.length < 4) return []
  const count = Math.min(maxStops, Math.max(4, Math.floor(positions.length / 25)))
  const out: [number, number][] = []
  for (let i = 1; i < count; i++) {
    out.push(pointAlong(positions, i / count))
  }
  return out
}

function thinStops<T>(stops: T[], max = 36): T[] {
  if (stops.length <= max) return stops
  const step = Math.ceil(stops.length / max)
  return stops.filter((_, i) => i % step === 0 || i === stops.length - 1)
}

function routeBadgeIcon(number: string, color: string) {
  return L.divIcon({
    className: 'route-map-badge',
    html: `<span class="route-map-badge-inner" style="background:${color}">${number}</span>`,
    iconSize: [52, 28],
    iconAnchor: [26, 14],
  })
}

function pinnedStopIcon(name: string) {
  return L.divIcon({
    className: 'pinned-map-label',
    html: `<div class="pinned-map-label-inner"><span class="pinned-map-dot"></span><span class="pinned-map-text">${name}</span></div>`,
    iconSize: [160, 36],
    iconAnchor: [12, 18],
  })
}

function FitView({
  polylines,
}: {
  polylines: [number, number][][]
}) {
  const map = useMap()

  const fit = useEffectEvent(() => {
    const points = polylines.flatMap((line) => line)

    if (points.length === 0) {
      return
    }

    if (points.length === 1) {
      map.setView(points[0], 15)
      return
    }

    const bounds = L.latLngBounds(points)
    map.fitBounds(bounds, {
      padding: [64, 64],
      maxZoom: 12,
    })
  })

  useEffect(() => {
    fit()
  }, [polylines])

  return null
}

function FocusStop({
  target,
}: {
  target: { lat: number; lng: number; key: number } | null
}) {
  const map = useMap()

  useEffect(() => {
    if (!target) return
    const zoom = Math.max(map.getZoom(), 15)
    map.flyTo([target.lat, target.lng], zoom, { duration: 0.55 })
  }, [target?.key, map])

  return null
}

export default function App() {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [geometries, setGeometries] = useState<Geometries>({})
  const [routeStops, setRouteStops] = useState<RouteStopsMap>({})
  const [query, setQuery] = useState('')
  const [ready, setReady] = useState(false)

  const [stopQuery, setStopQuery] = useState('')
  const [stopResults, setStopResults] = useState<BusStop[]>([])
  const [pinnedStops, setPinnedStops] = useState<BusStop[]>([])
  const [focusStop, setFocusStop] = useState<{
    lat: number
    lng: number
    key: number
  } | null>(null)
  const [stopSearching, setStopSearching] = useState(false)
  const [stopError, setStopError] = useState<string | null>(null)
  const [stopPanelOpen, setStopPanelOpen] = useState(false)
  const stopAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    Promise.all([
      fetch(`${base}routes/geometries.json`).then((r) => r.json()),
      fetch(`${base}routes/routeStops.json`).then((r) => (r.ok ? r.json() : {})),
    ])
      .then(([geo, stops]) => {
        setGeometries(geo)
        setRouteStops(stops)
        setReady(true)
      })
      .catch(() => setReady(true))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return BUS_ROUTES
    return BUS_ROUTES.filter(
      (r) =>
        r.number.toLowerCase().includes(q) ||
        r.origin.includes(query.trim()) ||
        r.destination.includes(query.trim()),
    )
  }, [query])

  const activeRoutes = useMemo(() => {
    const lines: ActiveRoute[] = []

    for (const route of BUS_ROUTES) {
      if (!selected.has(route.id)) continue
      const geo = geometries[route.id]
      if (!geo?.polylines?.length) continue

      const pieces = geo.polylines.filter((p) => p.length >= 2)
      if (pieces.length === 0) continue

      let merged = [...pieces[0]] as [number, number][]
      for (let i = 1; i < pieces.length; i++) {
        const next = pieces[i]
        const end = merged[merged.length - 1]
        const start = next[0]
        const endRev = next[next.length - 1]
        const dStraight =
          (end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2
        const dRev =
          (end[0] - endRev[0]) ** 2 + (end[1] - endRev[1]) ** 2
        if (dRev < dStraight) {
          merged = merged.concat([...next].reverse() as [number, number][])
        } else {
          merged = merged.concat(next)
        }
      }

      lines.push({
        id: route.id,
        color: route.color,
        positions: merged,
        number: route.number,
        approx: geo.source === 'approx',
        origin: route.origin,
        destination: route.destination,
      })
    }
    return lines
  }, [selected, geometries])

  const activeStops = useMemo(() => {
    const out: { key: string; lat: number; lng: number; color: string; name: string }[] = []
    for (const route of BUS_ROUTES) {
      if (!selected.has(route.id)) continue
      const stops = routeStops[route.id]
      if (!stops?.length) continue
      const list = stops.filter((s) => s.dir === 0)
      const use = thinStops(list.length >= 5 ? list : stops, 28)
      for (const s of use) {
        out.push({
          key: `${route.id}-${s.id}-${s.seq}`,
          lat: s.lat,
          lng: s.lng,
          color: route.color,
          name: s.name,
        })
      }
    }
    return out
  }, [selected, routeStops])

  const boundsPolylines = useMemo(
    () => activeRoutes.map((l) => l.positions),
    [activeRoutes],
  )

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(BUS_ROUTES.map((r) => r.id)))
  }

  function clearAll() {
    setSelected(new Set())
  }

  const allSelected = selected.size === BUS_ROUTES.length

  async function handleStopSearch(e?: FormEvent) {
    e?.preventDefault()
    const q = stopQuery.trim()
    if (q.length < 2) {
      setStopError('정류장 이름을 두 글자 이상 입력하세요.')
      return
    }

    stopAbortRef.current?.abort()
    const controller = new AbortController()
    stopAbortRef.current = controller

    setStopSearching(true)
    setStopError(null)
    try {
      const results = await searchBusStops(q, controller.signal)
      if (controller.signal.aborted) return
      setStopResults(results)
      if (results.length === 0) {
        setStopError('검색 결과가 없습니다.')
      }
    } catch (err) {
      if (controller.signal.aborted) return
      setStopResults([])
      setStopError('정류장 검색에 실패했습니다. 잠시 후 다시 시도하세요.')
    } finally {
      if (!controller.signal.aborted) setStopSearching(false)
    }
  }

  function pinStop(stop: BusStop) {
    setPinnedStops((prev) => {
      if (prev.some((s) => s.id === stop.id)) return prev
      return [...prev, stop]
    })
    setFocusStop({ lat: stop.lat, lng: stop.lng, key: Date.now() })
  }

  function unpinStop(id: string) {
    setPinnedStops((prev) => prev.filter((s) => s.id !== id))
  }

  function clearPinnedStops() {
    setPinnedStops([])
  }

  const showEmptyHint = selected.size === 0 && pinnedStops.length === 0

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="sidebar-header">
          <p className="brand">INCHEON TRANSIT</p>
          <h1 className="title">인천 버스 노선 지도</h1>
          <p className="subtitle">노선을 선택하면 지도에 경로가 표시됩니다</p>
        </header>

        <section className={`stop-panel${stopPanelOpen ? ' is-open' : ''}`}>
          <button
            type="button"
            className="stop-toggle"
            onClick={() => setStopPanelOpen((v) => !v)}
            aria-expanded={stopPanelOpen}
          >
            <span>정류장 검색</span>
            <span className="stop-toggle-meta">
              {pinnedStops.length > 0 && `${pinnedStops.length} 표기`}
              <span className="stop-toggle-chevron" aria-hidden>
                {stopPanelOpen ? '▴' : '▾'}
              </span>
            </span>
          </button>

          {!stopPanelOpen && pinnedStops.length > 0 && (
            <div className="pinned-chips">
              {pinnedStops.map((stop) => (
                <button
                  key={stop.id}
                  type="button"
                  className="pinned-chip"
                  onClick={() => unpinStop(stop.id)}
                  title="표기 해제"
                >
                  {stop.name}
                  <span aria-hidden>×</span>
                </button>
              ))}
            </div>
          )}

          {stopPanelOpen && (
            <div className="stop-panel-body">
              <form className="stop-search" onSubmit={handleStopSearch}>
                <input
                  type="search"
                  placeholder="예: 송도역, 주안역"
                  value={stopQuery}
                  onChange={(e) => {
                    setStopQuery(e.target.value)
                    setStopError(null)
                  }}
                />
                <button
                  type="submit"
                  className="action stop-search-btn"
                  disabled={stopSearching}
                >
                  {stopSearching ? '…' : '검색'}
                </button>
              </form>

              {stopError && <p className="stop-status is-error">{stopError}</p>}

              {stopResults.length > 0 && (
                <ul className="stop-results">
                  {stopResults.map((stop) => {
                    const pinned = pinnedStops.some((s) => s.id === stop.id)
                    return (
                      <li key={stop.id}>
                        <button
                          type="button"
                          className={`stop-result${pinned ? ' is-pinned' : ''}`}
                          onClick={() =>
                            pinned ? unpinStop(stop.id) : pinStop(stop)
                          }
                        >
                          <span className="stop-result-name">{stop.name}</span>
                          {stop.vicinity && (
                            <span className="stop-result-vicinity">
                              {stop.vicinity}
                            </span>
                          )}
                          <span className="stop-result-action">
                            {pinned ? '해제' : '표기'}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}

              {pinnedStops.length > 0 && (
                <div className="pinned-block">
                  <div className="pinned-header">
                    <span>표기 중 {pinnedStops.length}</span>
                    <button
                      type="button"
                      className="ghost"
                      onClick={clearPinnedStops}
                    >
                      모두 지우기
                    </button>
                  </div>
                  <ul className="pinned-list">
                    {pinnedStops.map((stop) => (
                      <li key={stop.id}>
                        <span className="pinned-dot" aria-hidden />
                        <span className="pinned-name">{stop.name}</span>
                        <button
                          type="button"
                          className="ghost pinned-remove"
                          onClick={() => unpinStop(stop.id)}
                          aria-label={`${stop.name} 표기 해제`}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>

        <div className="routes-section">
          <div className="toolbar">
            <div className="section-head">
              <div className="panel-label">주요 버스 노선</div>
              <span className="selection-chip">{selected.size}/{BUS_ROUTES.length}</span>
            </div>
            <label className="search">
              <span className="sr-only">노선 검색</span>
              <input
                type="search"
                placeholder="번호·기점·종점 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="toolbar-actions">
              <button
                type="button"
                className="action"
                onClick={selectAll}
                disabled={allSelected}
              >
                모두 선택하기
              </button>
              <button
                type="button"
                className="ghost"
                onClick={clearAll}
                disabled={selected.size === 0}
              >
                초기화
              </button>
            </div>
          </div>

          {!ready && (
            <div className="selection-meta">
              <span className="muted">경로 불러오는 중…</span>
            </div>
          )}

          <ul className="route-list">
            {filtered.map((route) => {
              const on = selected.has(route.id)
              const geo = geometries[route.id]
              const hasPath = Boolean(geo?.polylines?.length)
              return (
                <li key={route.id}>
                  <button
                    type="button"
                    className={`route-item${on ? ' is-on' : ''}`}
                    onClick={() => toggle(route.id)}
                    aria-pressed={on}
                    style={
                      {
                        '--route-color': route.color,
                      } as CSSProperties
                    }
                  >
                    <span
                      className="route-badge"
                      style={{ background: route.color }}
                    >
                      {route.number}
                    </span>
                    <span className="route-meta">
                      <span className="route-od">
                        {route.origin}
                        <span className="arrow">↔</span>
                        {route.destination}
                      </span>
                      {!hasPath && ready && (
                        <span className="route-hint">경로 데이터 없음</span>
                      )}
                    </span>
                    <span className={`route-check${on ? ' is-on' : ''}`} aria-hidden>
                      {on ? '✓' : ''}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="legend-key">
            <div className="legend-key-item">
              <span className="key-stop" />
              <span>정류장</span>
            </div>
            <div className="legend-key-item">
              <span className="key-line" />
              <span>버스 노선 경로</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="map-pane">
        <MapContainer
          center={[37.45, 126.68]}
          zoom={11}
          className="map"
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.vworld.kr/">VWorld</a> / 국토교통부'
            url="https://xdworld.vworld.kr/2d/Base/service/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <ZoomControl position="bottomright" />
          <ScaleControl position="bottomright" imperial={false} maxWidth={140} />
          <FitView polylines={boundsPolylines} />
          <FocusStop target={focusStop} />

          {activeRoutes.map((line) => (
            <Polyline
              key={`${line.id}-casing`}
              positions={line.positions}
              pathOptions={{
                color: '#ffffff',
                weight: 11,
                opacity: 0.35,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          ))}

          {activeRoutes.map((line) => (
            <Polyline
              key={line.id}
              positions={line.positions}
              pathOptions={{
                color: line.color,
                weight: 6,
                opacity: 0.52,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          ))}

          {activeStops.map((stop) => (
            <CircleMarker
              key={stop.key}
              center={[stop.lat, stop.lng]}
              radius={3.2}
              pathOptions={{
                color: stop.color,
                weight: 2,
                fillColor: '#ffffff',
                fillOpacity: 1,
              }}
            >
              <Tooltip direction="top" offset={[0, -4]} className="stop-tooltip">
                {stop.name}
              </Tooltip>
            </CircleMarker>
          ))}

          {activeRoutes
            .filter((line) => !routeStops[line.id]?.length)
            .map((line) =>
              sampleStops(line.positions).map((pos, i) => (
                <CircleMarker
                  key={`${line.id}-stop-${i}`}
                  center={pos}
                  radius={3.2}
                  pathOptions={{
                    color: line.color,
                    weight: 2,
                    fillColor: '#ffffff',
                    fillOpacity: 1,
                  }}
                />
              )),
            )}

          {activeRoutes.map((line) => (
            <Marker
              key={`${line.id}-badge`}
              position={pointAlong(line.positions, 0.38)}
              icon={routeBadgeIcon(line.number, line.color)}
              interactive={false}
            />
          ))}

          {pinnedStops.map((stop) => (
            <Marker
              key={stop.id}
              position={[stop.lat, stop.lng]}
              icon={pinnedStopIcon(stop.name)}
            />
          ))}
        </MapContainer>

        <div className="north-arrow" aria-hidden>
          <span>N</span>
        </div>

        {showEmptyHint && (
          <div className="map-empty">
            <p>왼쪽에서 노선을 선택하세요</p>
          </div>
        )}
      </main>
    </div>
  )
}
