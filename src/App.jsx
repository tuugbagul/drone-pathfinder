import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { bfs, dfs, dijkstra, astar, dangerMap } from './utils/algorithms'
import './App.css'

// ── Grid config ───────────────────────────────────────────────────────────────
const COLS = 38
const ROWS = 24
const CELL = 22
const GW   = COLS * CELL   // 836
const GH   = ROWS * CELL   // 528

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  bg:          '#0b0d15',
  gridLine:    '#161926',
  empty:       '#10131f',
  obstacle:    '#2e3242',
  noflyFill:   '#2a0a0a',
  noflyBorder: '#8c1c1c',
  start:       '#1958c0',
  end:         '#b82820',
  visited:     '#0f2d52',
  pathShort:   '#d97f18',
  pathSafe:    '#22a84a',
  blue:        '#3d82f0',
  green:       '#28b950',
  red:         '#d73732',
  amber:       '#e19b23',
  purple:      '#9055d8',
  white:       '#ffffff',
  txtSec:      '#5a6080',
}

const ALGO_COLORS = {
  BFS:      C.blue,
  DFS:      C.purple,
  Dijkstra: C.amber,
  'A*':     C.pathShort,
}

// ── Grid helpers ──────────────────────────────────────────────────────────────
function makeGrid() {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ({ wall: false, nofly: false }))
  )
}

function inBounds(r, c) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS
}

function addDefaultMap(grid) {
  const g = grid.map(row => row.map(cell => ({ ...cell })))
  for (let r = 4; r < 13; r++) g[r][8].wall  = true
  for (let c = 8; c < 14; c++) g[10][c].wall  = true
  for (let r = 2; r < 10; r++) g[r][15].wall  = true
  for (let c = 4; c < 11; c++) g[14][c].wall  = true
  for (let r = 13; r < 22; r++) g[r][20].wall = true
  for (let c = 27; c < 33; c++) g[18][c].wall = true
  for (let r = 4; r < 13; r++) g[r][25].wall  = true
  for (let r = 2; r < 6;  r++) for (let c = 17; c < 22; c++) g[r][c].nofly = true
  for (let r = 14; r < 18; r++) for (let c = 11; c < 15; c++) g[r][c].nofly = true
  for (let r = 19; r < 23; r++) for (let c = 29; c < 33; c++) g[r][c].nofly = true
  return g
}

function cellCenter(r, c) {
  return [c * CELL + CELL / 2, r * CELL + CELL / 2]
}

// ── Drone drawing ─────────────────────────────────────────────────────────────
function drawDrone(ctx, cx, cy, angle, size = 12) {
  for (const aa of [45, 135, 225, 315]) {
    const rad = ((angle + aa) * Math.PI) / 180
    const ex  = cx + size * Math.cos(rad)
    const ey  = cy + size * Math.sin(rad)
    ctx.strokeStyle = '#8aa8cc'
    ctx.lineWidth   = 2
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(ex, ey)
    ctx.stroke()
    // propeller glow
    ctx.shadowBlur  = 6
    ctx.shadowColor = '#5aa0ff'
    ctx.fillStyle   = '#4d8fe0'
    ctx.beginPath()
    ctx.arc(ex, ey, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#a0d0ff'
    ctx.beginPath()
    ctx.arc(ex, ey, 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
  }
  ctx.shadowBlur  = 8
  ctx.shadowColor = '#3d82f0'
  ctx.fillStyle   = '#2a60d0'
  ctx.beginPath()
  ctx.arc(cx, cy, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#80bfff'
  ctx.beginPath()
  ctx.arc(cx, cy, 2.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const canvasRef      = useRef(null)
  const containerRef   = useRef(null)
  const rafRef         = useRef(null)
  const draggingRef    = useRef(false)
  const [scale, setScale] = useState(1)

  // All mutable game state lives here — read directly in RAF loop
  const gs = useRef({
    grid:        addDefaultMap(makeGrid()),
    start:       [3, 3],
    end:         [ROWS - 4, COLS - 4],
    algo:        'A*',
    drawMode:    'wall',
    battery:     120,
    visitedSet:  new Set(),
    pathCells:   [],
    pathColor:   C.pathShort,
    pathShort:   [],
    pathSafe:    [],
    compareMode: false,
    scanning:    false,
    scanOrder:   [],
    scanIdx:     0,
    statLines:   [],
    msg:         'Draw walls · left-drag = wall · right-drag = no-fly zone · then press RUN',
    msgColor:    C.txtSec,
    flying:      false,
    dronePath:   [],
    dronePos:    null,
    droneIdx:    0,
    droneAngle:  0,
    danger:      null,
    pend:        null,
  })

  // React state only for the panel (re-renders ~few times per interaction)
  const [panel, setPanel] = useState({
    algo:       'A*',
    drawMode:   'wall',
    battery:    120,
    statLines:  [],
    msg:        'Draw walls · left-drag = wall · right-drag = no-fly zone · then press RUN',
    msgColor:   C.txtSec,
  })

  const syncPanel = useCallback(() => {
    const g = gs.current
    setPanel({
      algo:      g.algo,
      drawMode:  g.drawMode,
      battery:   g.battery,
      statLines: [...g.statLines],
      msg:       g.msg,
      msgColor:  g.msgColor,
    })
  }, [])

  // ── Canvas drawing ──────────────────────────────────────────────────────────
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const g   = gs.current

    ctx.fillStyle = C.bg
    ctx.fillRect(0, 0, GW, GH)

    const shortSet = new Set(g.pathShort.map(([r, c]) => `${r},${c}`))
    const safeSet  = new Set(g.pathSafe.map(([r, c])  => `${r},${c}`))
    const pathSet  = new Set(g.pathCells.map(([r, c]) => `${r},${c}`))

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x    = c * CELL + 1
        const y    = r * CELL + 1
        const w    = CELL - 2
        const h    = CELL - 2
        const cell = g.grid[r][c]
        const pos  = `${r},${c}`
        const isSt = r === g.start[0] && c === g.start[1]
        const isEn = r === g.end[0]   && c === g.end[1]

        let color
        if (cell.wall) {
          color = C.obstacle
        } else if (cell.nofly) {
          color = C.noflyFill
        } else if (isSt) {
          color = C.start
        } else if (isEn) {
          color = C.end
        } else if (g.compareMode) {
          if (shortSet.has(pos) && safeSet.has(pos)) color = C.white
          else if (shortSet.has(pos))                color = C.pathShort
          else if (safeSet.has(pos))                 color = C.pathSafe
          else if (g.visitedSet.has(pos))            color = C.visited
          else                                       color = C.empty
        } else {
          if (pathSet.has(pos))           color = g.pathColor
          else if (g.visitedSet.has(pos)) color = C.visited
          else                            color = C.empty
        }

        ctx.fillStyle = color
        ctx.fillRect(x, y, w, h)

        if (cell.nofly) {
          ctx.strokeStyle = C.noflyBorder
          ctx.lineWidth   = 1
          ctx.strokeRect(x, y, w, h)
        }
      }
    }

    // Grid lines
    ctx.strokeStyle = C.gridLine
    ctx.lineWidth   = 1
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(GW, r * CELL); ctx.stroke()
    }
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, GH); ctx.stroke()
    }

    // Start / End labels
    ctx.fillStyle    = C.white
    ctx.font         = `bold 12px 'JetBrains Mono', monospace`
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'middle'
    const [sx, sy] = cellCenter(g.start[0], g.start[1])
    const [ex, ey] = cellCenter(g.end[0],   g.end[1])
    ctx.fillText('D', sx, sy)
    ctx.fillText('T', ex, ey)

    // Drone
    if (g.dronePos) {
      drawDrone(ctx, g.dronePos[0], g.dronePos[1], g.droneAngle)
    }
  }, [])

  // ── Animation loop ──────────────────────────────────────────────────────────
  const tick = useCallback(() => {
    const g = gs.current
    let needSync = false

    // Scan animation — reveal visited cells
    if (g.scanning) {
      for (let i = 0; i < 6; i++) {
        if (g.scanIdx < g.scanOrder.length) {
          const [r, c] = g.scanOrder[g.scanIdx]
          g.visitedSet.add(`${r},${c}`)
          g.scanIdx++
        } else {
          g.scanning = false
          const { path, color, elapsed, plen, order } = g.pend
          g.pathCells = path
          g.pathColor = color
          const within = plen <= g.battery
          g.statLines = [
            ['Algorithm',     g.algo,                      ALGO_COLORS[g.algo] || C.pathShort],
            ['Cells visited', String(order.length),        C.blue],
            ['Path length',   `${plen} steps`,             C.amber],
            ['Calc time',     `${elapsed} ms`,             C.txtSec],
            ['Battery',       `${plen}/${g.battery} ${within ? 'OK' : 'OVER!'}`, within ? C.green : C.red],
          ]
          if (path.length > 1) {
            const flightPath = within ? path : path.slice(0, g.battery + 1)
            g.msg      = within
              ? `Path found — ${plen} steps.  Drone launching!`
              : `Battery limit reached! Flying first ${g.battery} of ${plen} steps.`
            g.msgColor = within ? C.green : C.amber
            g.dronePath = flightPath.map(([r, c]) => cellCenter(r, c))
            g.dronePos  = [...g.dronePath[0]]
            g.droneIdx  = 1
            g.droneAngle = 0
            g.flying    = true
          } else {
            g.msg      = 'No path found. Remove some obstacles.'
            g.msgColor = C.red
          }
          needSync = true
          break
        }
      }
    }

    // Drone flight
    if (g.flying && g.dronePos) {
      if (g.droneIdx >= g.dronePath.length) {
        g.flying   = false
        const lastCell = g.dronePath[g.dronePath.length - 1]
        const [er, ec] = cellCenter(g.end[0], g.end[1])
        const reachedTarget = lastCell[0] === er && lastCell[1] === ec
        g.msg      = reachedTarget ? 'Drone reached the target!' : 'Battery depleted — drone stopped mid-flight.'
        g.msgColor = reachedTarget ? C.green : C.red
        needSync   = true
      } else {
        const [tx, ty] = g.dronePath[g.droneIdx]
        const dx   = tx - g.dronePos[0]
        const dy   = ty - g.dronePos[1]
        const dist = Math.hypot(dx, dy)
        g.droneAngle = (g.droneAngle + 5) % 360
        const speed  = 3.2
        if (dist <= speed) {
          g.dronePos = [tx, ty]
          g.droneIdx++
        } else {
          g.dronePos[0] += (dx / dist) * speed
          g.dronePos[1] += (dy / dist) * speed
        }
      }
    }

    drawCanvas()
    if (needSync) syncPanel()
    rafRef.current = requestAnimationFrame(tick)
  }, [drawCanvas, syncPanel])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [tick])

  // Scale canvas to fill viewport height
  useEffect(() => {
    const update = () => {
      const availH = window.innerHeight - 32 // status bar height
      setScale(availH / GH)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // ── Mouse input ─────────────────────────────────────────────────────────────
  const getCell = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const scaleX = GW / rect.width
    const scaleY = GH / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top)  * scaleY
    return [Math.floor(y / CELL), Math.floor(x / CELL)]
  }

  const applyCell = (r, c, toggle, button) => {
    const g  = gs.current
    if (!inBounds(r, c)) return
    const isSt = r === g.start[0] && c === g.start[1]
    const isEn = r === g.end[0]   && c === g.end[1]
    const cell = g.grid[r][c]

    // Right-click → no-fly regardless of drawMode
    const mode = button === 2 ? 'nofly' : g.drawMode

    if (mode === 'start') {
      g.start = [r, c]
      g.grid[r][c] = { wall: false, nofly: false }
      syncPanel()
    } else if (mode === 'end') {
      g.end = [r, c]
      g.grid[r][c] = { wall: false, nofly: false }
      syncPanel()
    } else if (mode === 'wall') {
      if (!isSt && !isEn) {
        g.grid[r][c] = { wall: toggle ? !cell.wall : true, nofly: false }
      }
    } else if (mode === 'nofly') {
      if (!isSt && !isEn) {
        g.grid[r][c] = { wall: false, nofly: toggle ? !cell.nofly : true }
      }
    }
    g.danger = null
  }

  const handleMouseDown = (e) => {
    draggingRef.current = e.button
    const [r, c] = getCell(e)
    applyCell(r, c, true, e.button)
  }

  const handleMouseMove = (e) => {
    if (draggingRef.current === false || draggingRef.current === undefined) return
    const [r, c] = getCell(e)
    applyCell(r, c, false, draggingRef.current)
  }

  const handleMouseUp = () => { draggingRef.current = false }

  // ── Algorithm runner ────────────────────────────────────────────────────────
  const runAlgo = (algoName, costMap) => {
    const g  = gs.current
    const t0 = performance.now()
    let result
    if (algoName === 'BFS')      result = bfs(g.grid, g.start, g.end)
    else if (algoName === 'DFS') result = dfs(g.grid, g.start, g.end)
    else if (algoName === 'Dijkstra') result = dijkstra(g.grid, g.start, g.end, costMap)
    else                         result = astar(g.grid, g.start, g.end, costMap)
    return { ...result, elapsed: Math.round(performance.now() - t0) }
  }

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleRun = () => {
    const g = gs.current
    g.compareMode = false
    g.danger      = dangerMap(g.grid)
    g.visitedSet  = new Set()
    g.pathCells   = []
    g.pathShort   = []
    g.pathSafe    = []
    g.flying      = false
    g.dronePos    = null

    const { order, path, elapsed } = runAlgo(g.algo)
    const plen = path.length > 1 ? path.length - 1 : 0

    g.scanOrder = order
    g.scanIdx   = 0
    g.scanning  = true
    g.pend      = { path, color: ALGO_COLORS[g.algo] || C.pathShort, elapsed, plen, order }
    g.msg       = `Searching…  (${g.algo})`
    g.msgColor  = ALGO_COLORS[g.algo] || C.txtSec
    syncPanel()
  }

  const handleCompare = () => {
    const g = gs.current
    g.danger      = dangerMap(g.grid)
    g.visitedSet  = new Set()
    g.pathCells   = []
    g.scanning    = false
    g.flying      = false
    g.dronePos    = null
    g.compareMode = true

    const { order: o1, path: shortPath } = runAlgo('A*')
    const { order: o2, path: safePath  } = runAlgo('A*', g.danger)

    g.pathShort = shortPath
    g.pathSafe  = safePath

    const seen = new Set()
    for (const [r, c] of [...o1, ...o2]) {
      const k = `${r},${c}`
      if (!seen.has(k)) { seen.add(k); g.visitedSet.add(k) }
    }

    const sp  = shortPath.length > 1 ? shortPath.length - 1 : 0
    const sfp = safePath.length  > 1 ? safePath.length  - 1 : 0
    const dc  = (path) => path.length > 1
      ? path.slice(1).reduce((s, [r, c]) => s + g.danger[r][c], 0) : 0

    g.statLines = [
      ['SHORTEST', '', C.pathShort],
      ['Length',      `${sp} steps`,        C.amber],
      ['Danger cost', String(dc(shortPath)), C.red],
      ['Battery',     `${sp}/${g.battery}`, sp <= g.battery ? C.green : C.red],
      ['SAFEST', '', C.pathSafe],
      ['Length',      `${sfp} steps`,       C.amber],
      ['Danger cost', String(dc(safePath)),  C.green],
      ['Battery',     `${sfp}/${g.battery}`,sfp <= g.battery ? C.green : C.red],
    ]
    g.msg      = 'Orange = shortest  ·  Green = safest  ·  White = shared'
    g.msgColor = C.txtSec

    if (safePath.length > 1) {
      const safeWithinBattery = sfp <= g.battery
      const flightPath = safeWithinBattery ? safePath : safePath.slice(0, g.battery + 1)
      g.dronePath  = flightPath.map(([r, c]) => cellCenter(r, c))
      g.dronePos   = [...g.dronePath[0]]
      g.droneIdx   = 1
      g.droneAngle = 0
      g.flying     = true
    }
    syncPanel()
  }

  const handleReset = () => {
    const g = gs.current
    g.visitedSet  = new Set()
    g.pathCells   = []
    g.pathShort   = []
    g.pathSafe    = []
    g.compareMode = false
    g.scanning    = false
    g.flying      = false
    g.dronePos    = null
    g.statLines   = []
    g.msg         = 'Reset — map preserved.'
    g.msgColor    = C.txtSec
    syncPanel()
  }

  const handleClear = () => {
    const g = gs.current
    g.grid        = makeGrid()
    g.danger      = null
    g.visitedSet  = new Set()
    g.pathCells   = []
    g.pathShort   = []
    g.pathSafe    = []
    g.compareMode = false
    g.scanning    = false
    g.flying      = false
    g.dronePos    = null
    g.statLines   = []
    g.msg         = 'Map cleared.'
    g.msgColor    = C.txtSec
    syncPanel()
  }

  const setAlgo = (a) => { gs.current.algo = a; syncPanel() }
  const setDrawMode = (m) => { gs.current.drawMode = m; syncPanel() }
  const adjustBattery = (delta) => {
    gs.current.battery = Math.max(20, Math.min(400, gs.current.battery + delta))
    syncPanel()
  }

  // ── Panel data ──────────────────────────────────────────────────────────────
  const { algo, drawMode, battery, statLines, msg, msgColor } = panel
  const battPct = Math.min(battery / 300, 1)
  const battCol = battPct > 0.5 ? C.green : battPct > 0.25 ? C.amber : C.red

  const ALGO_META = [
    { key: 'BFS',      label: 'BFS',      color: C.blue   },
    { key: 'DFS',      label: 'DFS',      color: C.purple },
    { key: 'Dijkstra', label: 'Dijkstra', color: C.amber  },
    { key: 'A*',       label: 'A*',       color: C.pathShort },
  ]

  const MODE_META = [
    { key: 'wall',  label: 'Wall',   color: '#888' },
    { key: 'nofly', label: 'No-fly', color: C.red  },
    { key: 'start', label: 'Start',  color: C.blue },
    { key: 'end',   label: 'End',    color: C.end  },
  ]

  return (
    <div className="app">
      {/* ── Grid canvas ─────────────────────────────────────────────────────── */}
      <div className="canvas-col" style={{ width: GW * scale }}>
        <div ref={containerRef} className="canvas-container">
          <canvas
            ref={canvasRef}
            width={GW}
            height={GH}
            style={{ width: GW * scale, height: GH * scale }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>
        <div
          className={`status-bar ${
            msgColor === C.green ? 'status-success' :
            msgColor === C.red   ? 'status-danger'  : ''
          }`}
          style={{ color: msgColor }}
        >
          {msg}
        </div>
      </div>

      {/* ── Side panel ──────────────────────────────────────────────────────── */}
      <div className="panel">
        <div className="panel-title">DRONE PATH PLANNER</div>

        <div className="section-label">ALGORITHM</div>
        <div className="btn-grid">
          {ALGO_META.map(({ key, label, color }) => (
            <button
              key={key}
              className={`btn ${algo === key ? 'btn-active' : ''}`}
              style={{ '--accent': color }}
              onClick={() => setAlgo(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="divider" />

        <div className="section-label">DRAW MODE</div>
        <div className="btn-grid">
          {MODE_META.map(({ key, label, color }) => (
            <button
              key={key}
              className={`btn ${drawMode === key ? 'btn-active' : ''}`}
              style={{ '--accent': color }}
              onClick={() => setDrawMode(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="divider" />

        <button className="btn btn-run" onClick={handleRun}>▶  RUN</button>
        <button className="btn btn-compare" onClick={handleCompare}>⇄  Compare Paths</button>

        <div className="btn-row">
          <button className="btn btn-half" onClick={handleReset}>Reset</button>
          <button className="btn btn-half btn-danger" onClick={handleClear}>Clear Map</button>
        </div>

        <div className="divider" />

        <div className="section-label">BATTERY LIMIT</div>
        <div className="battery-row">
          <button className="btn btn-icon" onClick={() => adjustBattery(-20)}>−</button>
          <div className="battery-bar-wrap">
            <div className="battery-bar-fill" style={{ width: `${battPct * 100}%`, background: battCol }} />
          </div>
          <button className="btn btn-icon" onClick={() => adjustBattery(+20)}>+</button>
        </div>
        <div className="battery-label" style={{ color: battCol }}>{battery} steps max</div>

        <div className="divider" />

        <div className="section-label">LAST RUN</div>
        <div className="stats">
          {statLines.length === 0 ? (
            <span style={{ color: C.txtSec, fontSize: 11 }}>No run yet.</span>
          ) : statLines.map(([label, val, color], i) =>
            val === '' ? (
              <div key={i} className="stat-section-header" style={{ color }}>{label}</div>
            ) : (
              <div key={i} className="stat-row">
                <span className="stat-label">{label}</span>
                <span className="stat-val" style={{ color }}>{val}</span>
              </div>
            )
          )}
        </div>

        <div className="spacer" />
        <div className="divider" />

        <div className="section-label">LEGEND</div>
        <div className="legend">
          {[
            [C.obstacle,   null,          'Wall'],
            [C.noflyFill,  C.noflyBorder, 'No-fly zone'],
            [C.visited,    null,          'Visited cells'],
            [C.pathShort,  null,          'Shortest path'],
            [C.pathSafe,   null,          'Safest path'],
          ].map(([bg, border, label], i) => (
            <div key={i} className="legend-row">
              <div
                className="legend-swatch"
                style={{ background: bg, outline: border ? `1px solid ${border}` : 'none' }}
              />
              <span>{label}</span>
            </div>
          ))}
        </div>

        <div className="divider" style={{ marginTop: 8 }} />
        <div style={{ fontSize: 10, color: '#2a2e48', textAlign: 'center' }}>
          Left-drag: wall · Right-drag: no-fly
        </div>
      </div>
    </div>
  )
}
