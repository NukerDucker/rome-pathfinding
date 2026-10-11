import {type NodeId, type Edge, ROMANIA} from './romania.ts';
import {type SearchResult, type Step} from './search.ts';

type EdgeWithCost = {
  from: NodeId;
  to: NodeId;
  cost: number;
};

type Path = {
  from: NodeId;
  cost: number;
};

type Meeting = {
  u: NodeId;    // endpoint on the forward-settled side
  v: NodeId;    // endpoint on the backward-settled side
  cost: number; // dF(u) + (u === v ? 0 : w(u,v)) + dB(v)
};

type IterateDijkstraReturn = {
  visitedNode: NodeId | null;
  // Cheapest meeting candidate this walk saw: either a node BOTH directions
  // have settled (u === v) or an edge crossing between the two settled
  // regions (u !== v). The crossing form is what makes early termination
  // sound: the optimal route can hide in a single edge neither side has
  // popped yet (see the Rimnicu Vilcea -> Craiova regression).
  meeting: Meeting | null;
};

export function biucs(start: NodeId, goal: NodeId): SearchResult {
  // Same endpoint guard as every other algorithm — without it an unknown city
  // reached ROMANIA[...] in the walk below and threw.
  if(!(start in ROMANIA) || !(goal in ROMANIA)){
    return {steps: [], parent: {}, path: [], found: false, generated: 0};
  }

  function iterateDijsktra(
    visitedPaths: Record<NodeId, Path>, pendingVisitPaths: EdgeWithCost[],
    otherVisitedPaths: Record<NodeId, Path>, parentToNode: Record<NodeId, Path>,
    backward: boolean
  ): IterateDijkstraReturn{
    if(pendingVisitPaths.length === 0) return {visitedNode: null, meeting: null};
    const shortestFrontierPath: EdgeWithCost = pendingVisitPaths.shift()!;

    let meeting: Meeting | null = null;
    const consider = (m: Meeting): void => {
      if(meeting === null || m.cost < meeting.cost) meeting = m;
    };

    const edgesFromFrontier: Edge[] = ROMANIA[shortestFrontierPath.to].edges;
    for(const edge of edgesFromFrontier){
      // Crossing candidate: edge from the node being settled to a node the
      // OTHER direction has already settled. Reported forward-oriented (u on
      // the start side) so reconstruction is direction-agnostic.
      const otherEdgePath: Path | undefined = otherVisitedPaths[edge.to];
      if(otherEdgePath !== undefined){
        const crossingCost = shortestFrontierPath.cost + edge.km + otherEdgePath.cost;
        consider(backward
          ? {u: edge.to, v: shortestFrontierPath.to, cost: crossingCost}
          : {u: shortestFrontierPath.to, v: edge.to, cost: crossingCost});
      }

      //Explored paths are guaranteed to be the cheapest one
      const edgeDestIsExplored = edge.to in visitedPaths;
      if(edgeDestIsExplored) continue;

      const pathToEdgeDest: EdgeWithCost = {
        from: shortestFrontierPath.to, to: edge.to, cost: edge.km + shortestFrontierPath.cost
      }
      const pendingVisitPathWithSameDestIndex: number = pendingVisitPaths.findIndex(
        function (path: EdgeWithCost): boolean {return path.to === edge.to;}
      );
      const pathNotDiscovered: boolean = pendingVisitPathWithSameDestIndex === -1;
      if(pathNotDiscovered){
        pendingVisitPaths.push(pathToEdgeDest);
      }else{
        const newPathIsCheaper: boolean = (
          pendingVisitPaths[pendingVisitPathWithSameDestIndex].cost > pathToEdgeDest.cost
        );
        if(newPathIsCheaper) pendingVisitPaths[pendingVisitPathWithSameDestIndex] = pathToEdgeDest;
      }

      const discoveredNodeNotInRecord: boolean = !(edge.to in parentToNode);
      if(discoveredNodeNotInRecord)
        parentToNode[edge.to] = {cost: pathToEdgeDest.cost, from: shortestFrontierPath.to};
      else{
        const newPathIsCheaper2: boolean = parentToNode[edge.to].cost > pathToEdgeDest.cost;
        if(newPathIsCheaper2) parentToNode[edge.to] = {cost:  pathToEdgeDest.cost, from: shortestFrontierPath.to};
      }
    }
    pendingVisitPaths.sort(function leastCostInFront(a, b){return a.cost - b.cost;});
    visitedPaths[shortestFrontierPath.to] = {from: shortestFrontierPath.from, cost: shortestFrontierPath.cost};
    const settled: NodeId = shortestFrontierPath.to;
    const otherPath: Path | undefined = otherVisitedPaths[settled];
    if(otherPath !== undefined)
      consider({u: settled, v: settled, cost: shortestFrontierPath.cost + otherPath.cost});
    return {visitedNode: settled, meeting};
  }

  const result: SearchResult = {steps: [], parent: {}, path: [], found: false, generated: 0};
  if(start === goal){
    result.path = [start];
    result.steps = [{current: start, frontier: [], visited: [start]}];
    result.found = true;
    result.generated = 1;
    return result;
  }

  const visitedForwardPaths: Record<NodeId, Path> = {};
  const pendingVisitForwardPaths: EdgeWithCost[] = [{from: start, to: start, cost: 0}];

  const visitedBackwardPaths: Record<NodeId, Path> = {};
  const pendingVisitBackwardPaths: EdgeWithCost[] = [{from: goal, to: goal, cost: 0}];
  const parentToNode: Record<NodeId, Path> = {};

  // Emitted state follows the Step contract (search.ts). R1 union rule: a node
  // closed by EITHER direction is `visited`; `frontier` holds every node still
  // pending in at least one direction that no direction has closed yet.
  const snapshot = (current: NodeId): Step => {
    const closed = new Set<NodeId>([
      ...Object.keys(visitedForwardPaths),
      ...Object.keys(visitedBackwardPaths),
    ]);
    const open = new Set<NodeId>();
    for(const edgeWithCost of pendingVisitForwardPaths) open.add(edgeWithCost.to);
    for(const edgeWithCost of pendingVisitBackwardPaths) open.add(edgeWithCost.to);
    for(const n of closed) open.delete(n);
    return { current, frontier: Array.from(open), visited: Array.from(closed) };
  };
  // generated = DISTINCT nodes ever discovered, by either direction.
  const generatedCount = (): number =>
    new Set<NodeId>([
      start,
      goal,
      ...Object.keys(visitedForwardPaths),
      ...Object.keys(visitedBackwardPaths),
      ...Object.keys(parentToNode),
    ]).size;

  // μ-based termination (same rule as biastar): the FIRST node settled by both
  // directions need not lie on the optimal path, so keep walking while a
  // cheaper meeting is still conceivable — minPendingF + minPendingB < μ —
  // and reconstruct through the cheapest meeting found (muNode).
  let mu = Infinity;
  let muMeeting: Meeting | null = null;

  while(true){
    const minF: number = pendingVisitForwardPaths.length > 0 ? pendingVisitForwardPaths[0].cost : Infinity;
    const minB: number = pendingVisitBackwardPaths.length > 0 ? pendingVisitBackwardPaths[0].cost : Infinity;
    if(minF === Infinity || minB === Infinity) break;      // a side ran dry — no meeting left
    if(muMeeting !== null && minF + minB >= mu) break;     // no cheaper meeting possible

    const forwardWalkReturn: IterateDijkstraReturn = iterateDijsktra(
      visitedForwardPaths, pendingVisitForwardPaths, visitedBackwardPaths, parentToNode, false
    );
    if(forwardWalkReturn.meeting && forwardWalkReturn.meeting.cost < mu){
      mu = forwardWalkReturn.meeting.cost;
      muMeeting = forwardWalkReturn.meeting;
    }
    if(forwardWalkReturn.visitedNode === null) break;

    const backwardWalkReturn: IterateDijkstraReturn = iterateDijsktra(
      visitedBackwardPaths, pendingVisitBackwardPaths, visitedForwardPaths, parentToNode, true
    );
    if(backwardWalkReturn.meeting && backwardWalkReturn.meeting.cost < mu){
      mu = backwardWalkReturn.meeting.cost;
      muMeeting = backwardWalkReturn.meeting;
    }
    if(backwardWalkReturn.visitedNode === null) break;
    // Forward and backward expansions are one bidirectional search step.
    result.steps.push(snapshot(backwardWalkReturn.visitedNode));
  }

  result.generated = generatedCount();
  if(muMeeting === null) return result;   // no meeting — unreachable goal

  // Rebuild the route through the optimal meeting. Each record's `from` chain
  // is settled-Dijkstra optimal for its own direction. For a crossing meeting
  // (u !== v) the path keeps the hop u -> v itself.
  const meeting: Meeting = muMeeting;
  // Walk a direction's `from` chain until its origin (from === self). Records
  // are typed Path by Record indexing, but an origin-less lookup is possible
  // at compile time — the runtime check stays.
  const chain = (records: Record<NodeId, Path>, from: NodeId, reverse: boolean): NodeId[] => {
    const out: NodeId[] = [from];
    while(true){
      const lastInsertedNode: NodeId = out.at(-1)!;
      const backtracingPath: Path | undefined = records[lastInsertedNode];
      if(!backtracingPath || backtracingPath.from === lastInsertedNode) break;
      out.push(backtracingPath.from);
    }
    return reverse ? out.reverse() : out;
  };

  result.path = chain(visitedForwardPaths, meeting.u, true);
  const meetingToGoal: NodeId[] = chain(visitedBackwardPaths, meeting.v, false);
  //.shift() + .concat() is expensive D:
  for(let i = meeting.u === meeting.v ? 1 : 0; i < meetingToGoal.length; i++)
    result.path.push(meetingToGoal[i]);
  for(const [to, path] of Object.entries(parentToNode))
    result.parent[to] = path.from;
  // Synthetic landing frame: final found-frame must carry an empty frontier
  // (Step contract), like every other algorithm's goal frame. Its `current` is the
  // meeting node (snapshot(meeting.v)), not the goal, unlike BFS/DFS/UCS/A* — inert
  // on screen, since nodeState paints every path node as 'path' on the final frame
  // before it consults `current`, and the meeting node is always on the path.
  result.steps.push({...snapshot(meeting.v), frontier: []});
  result.found = true;
  return result;
}

function selfCheck(): void {
  const result = biucs('Arad', 'Bucharest')
  const expectedPath: NodeId[] = ['Arad', 'Sibiu', 'Rimnicu Vilcea', 'Pitesti', 'Bucharest']

  if (!result.found) {
    throw new Error('biucs.ts self-check failed: Arad -> Bucharest should be found')
  }
  const matches =
    result.path.length === expectedPath.length &&
    result.path.every((city, i) => city === expectedPath[i])
  if (!matches) {
    throw new Error(
      `biucs.ts self-check failed: expected path ${expectedPath.join(' -> ')}, got ${result.path.join(' -> ')}`,
    )
  }

  const trivial = biucs('Arad', 'Arad')
  if (!trivial.found || trivial.path.length !== 1 || trivial.path[0] !== 'Arad') {
    throw new Error('biucs.ts self-check failed: start === goal case broken')
  }
}

selfCheck();
