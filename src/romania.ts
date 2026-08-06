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

// Schematic x,y coords for a 600x450 viewBox, textbook layout, spread to fill
// the map panel edge-to-edge (22 units of gutter for the selection rings).
// Roads are short in the Timisoara->Drobeta chain, so the extra spacing is what
// keeps a selection ring from swallowing the distance pill on those segments.
const COORDS: Record<NodeId, { x: number; y: number }> = {
  Oradea: { x: 73, y: 28 },
  Zerind: { x: 46, y: 77 },
  Arad: { x: 28, y: 131 },
  Timisoara: { x: 32, y: 235 },
  Lugoj: { x: 108, y: 281 },
  Mehadia: { x: 113, y: 330 },
  Drobeta: { x: 114, y: 379 },
  Craiova: { x: 212, y: 398 },
  Sibiu: { x: 157, y: 180 },
  'Rimnicu Vilcea': { x: 190, y: 242 },
  Fagaras: { x: 279, y: 188 },
  Pitesti: { x: 288, y: 295 },
  Bucharest: { x: 380, y: 347 },
  Giurgiu: { x: 352, y: 422 },
  Urziceni: { x: 449, y: 313 },
  Hirsova: { x: 537, y: 318 },
  Eforie: { x: 572, y: 389 },
  Vaslui: { x: 505, y: 195 },
  Iasi: { x: 469, y: 114 },
  Neamt: { x: 398, y: 73 },
}

// Single-letter map glyph, drawn inside the node circle. Every city in the
// AIMA map starts with a distinct letter, so first-initial is unambiguous.
export function cityCode(id: NodeId): string {
  return id.charAt(0)
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

// Self-check: adjacency symmetric (A->B km === B->A km), every neighbor exists,
// and every city glyph is unique (the map draws initials, not full names).
function selfCheck(): void {
  const codes = new Map<string, NodeId>()
  for (const id of CITIES) {
    const code = cityCode(id)
    const clash = codes.get(code)
    if (clash !== undefined) {
      throw new Error(`romania.ts self-check failed: ${id} and ${clash} share glyph "${code}"`)
    }
    codes.set(code, id)
  }
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
