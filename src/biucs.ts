import {type NodeId, type Edge, ROMANIA} from './romania.ts';
import {type SearchResult} from './search.ts';

type EdgeWithCost = {
  from: NodeId;
  to: NodeId;
  cost: number;
};

type Path = {
  from: NodeId;
  cost: number;
};

type IterateDijkstraReturn = {
  visitedNode: NodeId | null;
  discoveredNodes: number;
};

export function biucs(start: NodeId, goal: NodeId): SearchResult {
  function iterateDijsktra(
    visitedPaths: Record<NodeId, Path>, pendingVisitPaths: EdgeWithCost[], parentToNode: Record<NodeId, Path>
  ): IterateDijkstraReturn{
    let discoveredNodes: number = 0;
    if(pendingVisitPaths.length === 0) return {visitedNode: null, discoveredNodes: 0};
    const shortestFrontierPath: EdgeWithCost = pendingVisitPaths.shift()!;

    const edgesFromFrontier: Edge[] = ROMANIA[shortestFrontierPath.to].edges;
    for(const edge of edgesFromFrontier){
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
        discoveredNodes += 1;
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
    return {visitedNode: shortestFrontierPath.to, discoveredNodes};
  }
  
  const ORIGIN_NODES: number = 2;
  const result: SearchResult = {steps: [], parent: {}, path: [], found: false, generated: ORIGIN_NODES};
  if(start === goal){
    result.path = [start];
    result.steps = [{current: start, frontier: [], visited: []}];
    result.found = true;
    return result;
  }

  const visitedForwardPaths: Record<NodeId, Path> = {};
  const pendingVisitForwardPaths: EdgeWithCost[] = [{from: start, to: start, cost: 0}];
  
  const visitedBackwardPaths: Record<NodeId, Path> = {};
  const pendingVisitBackwardPaths: EdgeWithCost[] = [{from: goal, to: goal, cost: 0}];  
  const parentToNode: Record<NodeId, Path> = {};
  let commonDest: NodeId | null = null;

  while(!commonDest){
    const forwardWalkReturn: IterateDijkstraReturn = iterateDijsktra(
      visitedForwardPaths, pendingVisitForwardPaths, parentToNode
    );
    result.generated += forwardWalkReturn.discoveredNodes;
    const fowardWalkNoPath = forwardWalkReturn.visitedNode === null;   
    if(fowardWalkNoPath) return result;

    const frontierNodes: Set<NodeId> = new Set();
    for(const edgeWithCost of pendingVisitForwardPaths)
      frontierNodes.add(edgeWithCost.to);
    for(const edgeWithCost of pendingVisitBackwardPaths)
      frontierNodes.add(edgeWithCost.to);
    const lastStep = result.steps.at(-1);
    const visitedNodes: NodeId[] = lastStep ? Array.from(lastStep.visited) : [];
    visitedNodes.push(forwardWalkReturn.visitedNode!);

    result.steps.push({
      current: forwardWalkReturn.visitedNode!,
      frontier: Array.from(frontierNodes),
      visited: visitedNodes
    });

    const backwardWalkReturn: IterateDijkstraReturn = iterateDijsktra(
      visitedBackwardPaths, pendingVisitBackwardPaths, parentToNode
    );
    result.generated += backwardWalkReturn.discoveredNodes;
    const backwardWalkNoPath = backwardWalkReturn.visitedNode === null;   
    if(backwardWalkNoPath) return result;
    
    for(const edgeWithCost of pendingVisitBackwardPaths)
      frontierNodes.add(edgeWithCost.to);
    visitedNodes.push(backwardWalkReturn.visitedNode!);

    result.steps.push({
      current: backwardWalkReturn.visitedNode!,
      frontier: Array.from(frontierNodes),
      visited: visitedNodes
    });
    
    //This is an edge case, bidirectional needs a node between start and goal
    const goalIsNextToStart: boolean = !!pendingVisitForwardPaths.find(
      function (path: EdgeWithCost){return path.to === goal;}
    );
    if(goalIsNextToStart){
      result.path = [start, goal];
      result.parent[goal] = start;
      result.found = true;
      for(const [to, path] of Object.entries(parentToNode))
        result.parent[to] = path.from;
      return result;
    }
    
    for(const [forwardDest, _] of Object.entries(visitedForwardPaths)){      
      if(forwardDest in visitedBackwardPaths){
        commonDest = forwardDest;
        break;
      }
    }
  }
  
  const commonDestToStart: NodeId[] = [commonDest!];
  while(true){
    const lastInsertedNode: NodeId = commonDestToStart.at(-1)!;
    const backtracingPath: Path = visitedForwardPaths[lastInsertedNode];
    const isPathOfOrigin: boolean = backtracingPath.from === lastInsertedNode;
    
    if(!backtracingPath || isPathOfOrigin) break;
    commonDestToStart.push(backtracingPath.from);
  }
  commonDestToStart.reverse();
  
  const commonDestToGoal: NodeId[] = [commonDest!];
  while(true){
    const lastInsertedNode: NodeId = commonDestToGoal.at(-1)!;
    const backtracingPath: Path = visitedBackwardPaths[lastInsertedNode];
    const isPathOfOrigin: boolean = backtracingPath.from === lastInsertedNode;
    
    if(!backtracingPath || isPathOfOrigin) break;
    commonDestToGoal.push(backtracingPath.from);
  }
  
  result.path = commonDestToStart;
  //.shift() + .concat() is expensive D:
  for(let i = 1; i < commonDestToGoal.length; i++)
    result.path.push(commonDestToGoal[i]);
  for(const [to, path] of Object.entries(parentToNode))
    result.parent[to] = path.from;
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