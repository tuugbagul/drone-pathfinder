# Drone Path Planner

An interactive pathfinding visualizer where a drone navigates through a 2D grid using four different AI search algorithms — with real-time animation, danger-aware routing, and battery constraints.

![demo](https://img.shields.io/badge/React-18-blue) ![vite](https://img.shields.io/badge/Vite-5-646CFF) ![canvas](https://img.shields.io/badge/Rendering-Canvas_API-orange)

---

## Features

- **4 Algorithms:** BFS, DFS, Dijkstra, A*
- **Draw tools:** Left-drag to place walls, right-drag for no-fly zones, click to move start/end
- **Scan animation:** Watch the algorithm explore cells in real time
- **Drone flight:** Animated drone flies the found path with spinning propellers
- **Compare mode:** Side-by-side shortest (orange) vs. safest (green) path using A*
- **Danger map:** Cells near obstacles get automatic cost penalties — Dijkstra and A* route around them
- **Battery limit:** Set a maximum step budget (20–400); warns if the path exceeds it
- **Default map:** Pre-built obstacle layout to get started immediately

---

## Getting Started

```bash
git clone https://github.com/tuugbagul/drone-pathfinder.git
cd drone-pathfinder
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## How to Use

| Action | Result |
|--------|--------|
| Left-drag on grid | Place / remove walls |
| Right-drag on grid | Place / remove no-fly zones |
| Select **Start** mode + click | Move drone start position |
| Select **End** mode + click | Move target position |
| **RUN** | Run selected algorithm with scan animation |
| **Compare Paths** | Show shortest vs. safest path simultaneously |
| **Reset** | Clear results, keep the map |
| **Clear Map** | Wipe everything |
| **− / +** buttons | Adjust battery step limit |

---

## Algorithms

| Algorithm | Strategy | Optimal? | Weighted? |
|-----------|----------|----------|-----------|
| BFS | Breadth-first (queue) | Yes (unweighted) | No |
| DFS | Depth-first (stack) | No | No |
| Dijkstra | Lowest-cost-first (min-heap) | Yes | Yes |
| A* | Dijkstra + Manhattan heuristic | Yes | Yes |

### Danger Map

`dangerMap()` assigns extra movement cost to cells near walls and no-fly zones:
- 1 cell away → +9 cost
- 2 cells away → +3 cost
- Normal cell → 1 cost

When passed to Dijkstra or A* as a cost map, the algorithm naturally routes the drone away from obstacles — producing the **safest** path.

---

## Project Structure

```
src/
├── App.jsx            # Main component — UI, canvas rendering, drone animation
├── App.css            # Dark theme styles
├── main.jsx           # React entry point
└── utils/
    └── algorithms.js  # BFS, DFS, Dijkstra, A*, dangerMap
```

---

## Tech Stack

- [React 18](https://react.dev/)
- [Vite 5](https://vitejs.dev/)
- HTML5 Canvas API (no external rendering libraries)
