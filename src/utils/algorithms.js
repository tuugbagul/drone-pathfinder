// ── Helpers ───────────────────────────────────────────────────────────────────

export function getNeighbors(grid, r, c) {
  const result = []
  const ROWS = grid.length
  const COLS = grid[0].length
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const nr = r + dr, nc = c + dc
    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS
        && !grid[nr][nc].wall && !grid[nr][nc].nofly) {
      result.push([nr, nc])
    }
  }
  return result
}

export function dangerMap(grid) {
  const ROWS = grid.length
  const COLS = grid[0].length
  const cost = Array.from({ length: ROWS }, () => new Array(COLS).fill(1))
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c].wall || grid[r][c].nofly) {
        cost[r][c] = 999
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const nr = r + dr, nc = c + dc
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS
                && !grid[nr][nc].wall && !grid[nr][nc].nofly) {
              const dist = Math.max(Math.abs(dr), Math.abs(dc))
              const extra = dist === 1 ? 9 : dist === 2 ? 3 : 0
              cost[nr][nc] = Math.max(cost[nr][nc], 1 + extra)
            }
          }
        }
      }
    }
  }
  return cost
}

function trace(cameFrom, start, end) {
  const endKey = `${end[0]},${end[1]}`
  const startKey = `${start[0]},${start[1]}`
  if (!cameFrom.has(endKey)) return []

  const path = []
  let cur = endKey
  while (cur !== null && cur !== undefined) {
    const [r, c] = cur.split(',').map(Number)
    path.push([r, c])
    cur = cameFrom.get(cur)
  }
  path.reverse()

  const first = path[0], last = path[path.length - 1]
  if (!first || first[0] !== start[0] || first[1] !== start[1]) return []
  if (!last  || last[0]  !== end[0]   || last[1]  !== end[1])   return []
  return path
}

// ── BFS ───────────────────────────────────────────────────────────────────────
export function bfs(grid, start, end) {
  const startKey = `${start[0]},${start[1]}`
  const endKey   = `${end[0]},${end[1]}`
  const queue    = [start]
  const cameFrom = new Map([[startKey, null]])
  const order    = []
  let head = 0

  while (head < queue.length) {
    const cur = queue[head++]
    const key = `${cur[0]},${cur[1]}`
    order.push(cur)
    if (key === endKey) break
    for (const nb of getNeighbors(grid, cur[0], cur[1])) {
      const nk = `${nb[0]},${nb[1]}`
      if (!cameFrom.has(nk)) {
        cameFrom.set(nk, key)
        queue.push(nb)
      }
    }
  }
  return { order, path: trace(cameFrom, start, end) }
}

// ── DFS ───────────────────────────────────────────────────────────────────────
export function dfs(grid, start, end) {
  const startKey = `${start[0]},${start[1]}`
  const endKey   = `${end[0]},${end[1]}`
  const stack    = [start]
  const cameFrom = new Map([[startKey, null]])
  const visited  = new Set()
  const order    = []

  while (stack.length) {
    const cur = stack.pop()
    const key = `${cur[0]},${cur[1]}`
    if (visited.has(key)) continue
    visited.add(key)
    order.push(cur)
    if (key === endKey) break
    for (const nb of getNeighbors(grid, cur[0], cur[1])) {
      const nk = `${nb[0]},${nb[1]}`
      if (!cameFrom.has(nk)) {
        cameFrom.set(nk, key)
        stack.push(nb)
      }
    }
  }
  return { order, path: trace(cameFrom, start, end) }
}

// ── Dijkstra ──────────────────────────────────────────────────────────────────
export function dijkstra(grid, start, end, costMap) {
  const ROWS = grid.length, COLS = grid[0].length
  const cm = costMap || Array.from({ length: ROWS }, () => new Array(COLS).fill(1))
  const startKey = `${start[0]},${start[1]}`
  const endKey   = `${end[0]},${end[1]}`
  const dist     = new Map([[startKey, 0]])
  const cameFrom = new Map([[startKey, null]])
  // Min-heap: [cost, row, col]
  const heap     = [[0, start[0], start[1]]]
  const visited  = new Set()
  const order    = []

  while (heap.length) {
    heap.sort((a, b) => a[0] - b[0])
    const [d, r, c] = heap.shift()
    const key = `${r},${c}`
    if (visited.has(key)) continue
    visited.add(key)
    order.push([r, c])
    if (key === endKey) break
    for (const [nr, nc] of getNeighbors(grid, r, c)) {
      const nk = `${nr},${nc}`
      const nd = d + cm[nr][nc]
      if (nd < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nd)
        cameFrom.set(nk, key)
        heap.push([nd, nr, nc])
      }
    }
  }
  return { order, path: trace(cameFrom, start, end) }
}

// ── A* ────────────────────────────────────────────────────────────────────────
export function astar(grid, start, end, costMap) {
  const ROWS = grid.length, COLS = grid[0].length
  const cm = costMap || Array.from({ length: ROWS }, () => new Array(COLS).fill(1))
  const h  = (r, c) => Math.abs(r - end[0]) + Math.abs(c - end[1])
  const startKey = `${start[0]},${start[1]}`
  const endKey   = `${end[0]},${end[1]}`
  const g        = new Map([[startKey, 0]])
  const cameFrom = new Map([[startKey, null]])
  // [f, gCost, row, col]
  const heap     = [[h(start[0], start[1]), 0, start[0], start[1]]]
  const visited  = new Set()
  const order    = []

  while (heap.length) {
    heap.sort((a, b) => a[0] - b[0])
    const [, d, r, c] = heap.shift()
    const key = `${r},${c}`
    if (visited.has(key)) continue
    visited.add(key)
    order.push([r, c])
    if (key === endKey) break
    for (const [nr, nc] of getNeighbors(grid, r, c)) {
      const nk = `${nr},${nc}`
      const ng = d + cm[nr][nc]
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng)
        cameFrom.set(nk, key)
        heap.push([ng + h(nr, nc), ng, nr, nc])
      }
    }
  }
  return { order, path: trace(cameFrom, start, end) }
}
