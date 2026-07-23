// Standard AIMA "Map of Romania" — 20 cities, 23 roads. No straight-line
// distance data (SLD is banned as a heuristic input — see HEURISTIC_GUIDE.md).

export type NodeId = string
export type Edge = { to: NodeId; km: number }
export type City = { x: number; y: number; edges: Edge[] }

// Entered once per direction; buildRomania() mirrors each edge.
type RawEdge = [NodeId, NodeId, number]

const RAW_EDGES: RawEdge[] = [
  ['Oradea', 'Zerind', 71],
  ['Oradea', 'Sibiu', 151],
  ['Zerind', 'Arad', 75],
  ['Arad', 'Sibiu', 140],
  ['Arad', 'Timisoara', 118],
  ['Timisoara', 'Lugoj', 111],
  ['Lugoj', 'Mehadia', 70],
  ['Mehadia', 'Drobeta', 75],
  ['Drobeta', 'Craiova', 120],
  ['Craiova', 'Rimnicu Vilcea', 146],
  ['Craiova', 'Pitesti', 138],
  ['Sibiu', 'Fagaras', 99],
  ['Sibiu', 'Rimnicu Vilcea', 80],
  ['Rimnicu Vilcea', 'Pitesti', 97],
  ['Fagaras', 'Bucharest', 211],
  ['Pitesti', 'Bucharest', 101],
  ['Bucharest', 'Giurgiu', 90],
  ['Bucharest', 'Urziceni', 85],
  ['Urziceni', 'Hirsova', 98],
  ['Hirsova', 'Eforie', 86],
  ['Urziceni', 'Vaslui', 142],
  ['Vaslui', 'Iasi', 92],
  ['Iasi', 'Neamt', 87],
]

// Schematic x,y coords for a 560x420 viewBox, textbook layout.
const COORDS: Record<NodeId, { x: number; y: number }> = {
  Oradea: { x: 100, y: 40 },
  Zerind: { x: 90, y: 100 },
  Arad: { x: 60, y: 170 },
  Timisoara: { x: 50, y: 260 },
  Lugoj: { x: 130, y: 300 },
  Mehadia: { x: 150, y: 350 },
  Drobeta: { x: 130, y: 400 },
  Craiova: { x: 230, y: 390 },
  Sibiu: { x: 200, y: 190 },
  'Rimnicu Vilcea': { x: 250, y: 260 },
  Fagaras: { x: 300, y: 180 },
  Pitesti: { x: 320, y: 300 },
  Bucharest: { x: 400, y: 340 },
  Giurgiu: { x: 390, y: 400 },
  Urziceni: { x: 470, y: 300 },
  Hirsova: { x: 540, y: 290 },
  Eforie: { x: 550, y: 350 },
  Vaslui: { x: 480, y: 200 },
  Iasi: { x: 440, y: 110 },
  Neamt: { x: 360, y: 80 },
}

function buildRomania(): Record<NodeId, City> {
  const map: Record<NodeId, City> = {}
  for (const id of Object.keys(COORDS)) {
    const coord = COORDS[id]
    map[id] = { x: coord.x, y: coord.y, edges: [] }
  }
  for (const [a, b, km] of RAW_EDGES) {
    map[a].edges.push({ to: b, km })
    map[b].edges.push({ to: a, km })
  }
  for (const id of Object.keys(map)) {
    map[id].edges.sort((e1, e2) => e1.to.localeCompare(e2.to))
  }
  return map
}

export const ROMANIA: Record<NodeId, City> = buildRomania()
export const CITIES: NodeId[] = Object.keys(ROMANIA).sort()

// Self-check: adjacency symmetric (A->B km === B->A km), every neighbor exists.
function selfCheck(): void {
  for (const id of CITIES) {
    for (const edge of ROMANIA[id].edges) {
      const neighbor = ROMANIA[edge.to]
      if (!neighbor) {
        throw new Error(`romania.ts self-check failed: ${id} -> ${edge.to} has no such city`)
      }
      const back = neighbor.edges.find((e) => e.to === id)
      if (!back) {
        throw new Error(`romania.ts self-check failed: ${edge.to} -> ${id} missing reverse edge`)
      }
      if (back.km !== edge.km) {
        throw new Error(
          `romania.ts self-check failed: ${id}<->${edge.to} asymmetric km (${edge.km} vs ${back.km})`,
        )
      }
    }
  }
}

selfCheck()
