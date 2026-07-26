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
  Oradea: { x: 985, y: 446 },
  Zerind: { x: 865, y: 658 },
  Arad: { x: 773, y: 874 },
  Timisoara: { x: 789, y: 1314 },
  Lugoj: { x: 1171, y: 1486 },
  Mehadia: { x: 1187, y: 1696 },
  Drobeta: { x: 1171, y: 1910 },
  Craiova: { x: 1643, y: 1974 },
  Sibiu: { x: 1401, y: 1058 },
  'Rimnicu Vilcea': { x: 1539, y: 1314 },
  Fagaras: { x: 1935, y: 1102 },
  Pitesti: { x: 2011, y: 1546 },
  Bucharest: { x: 2441, y: 1760 },
  Giurgiu: { x: 2301, y: 2062 },
  Urziceni: { x: 2745, y: 1636 },
  Hirsova: { x: 3159, y: 1636 },
  Eforie: { x: 3313, y: 1942 },
  Vaslui: { x: 3029, y: 1128 },
  Iasi: { x: 2837, y: 796 },
  Neamt: { x: 2471, y: 630 },
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
