# Chaos of the Ants (CoA)

Emergent routing through decentralized swarm intelligence.

Hundreds of autonomous agents search a fully three-dimensional world. None of them is given a map, a global planner, or the hidden reference path from the nest to food. Each agent can only use what it senses, what it remembers from its own walk, and — in CoA mode — what a neighbor tells it at close range.

**Local chaos + simple rules = emergent global order.**

## Run

```bash
npm install
npm run dev
```

Production build and tests:

```bash
npm run build
npm run test
```

No backend and no database. The simulation engine does not import React or Three.js, so the tests run in Node.

## What you are looking at

The default scene is a 3D recursive-backtracking maze inside a 60 × 30 × 60 world. Agents leave the nest, explore passages in X, Y, and Z, and try to carry food home. Food pheromone (orange) is laid on the way back. Home pheromone (blue) is laid on the way out. Successful deliveries reinforce both.

The magenta **reference route** is a research overlay. It is the shortest 6-connected voxel path. Agent code never reads it. Turn it on from the layer list when you want to compare the swarm with the benchmark.

## Four rules

1. **Explore.** Movement is a local choice among open neighboring voxels, mixed with an exploration probability. With probability `p`, an agent ignores the local gradient and samples an open direction uniformly. With probability `1 - p`, it takes the strongest local option. Ties are broken by the seeded generator.
2. **Encounter.** Two agents inside the communication radius may exchange food location, home location, route fragments, and obstacle notes. Transfer is `sourceConfidence * relayRetention * hopReliability * distanceFactor`. Pair cooldowns and versioned sources block repeated copies of the same fact. Facts that disagree keep the higher confidence.
3. **Reinforce.** A delivery adds pheromone along the outbound samples of that trip, on top of the continuous deposit while walking.
4. **Forget.** Pheromone uses the time-scaled form of `tau <- (1 - rho) * tau + deposit`, implemented as `tau *= (1 - rho) ^ dt` before the deposit. Knowledge confidence decays as `exp(-knowledgeDecay * dt)` and is dropped under 0.05.

Evaporation rate `rho` is per second, not per frame. The same seed and settings replay the same run because the clock is a fixed 1/20 s step and every random draw comes from mulberry32.

## What an agent is allowed to know

The engine stores the full voxel map, nest, food, and reference path. Policies in `src/algorithms` do not receive that path.

An agent may steer by:

- a direct sensory hit (food or nest within the sensing radius **and** a clear line of sight)
- its own breadcrumb stack, capped by `maxCrumbs`
- the local 6-neighbor pheromone gradient, when pheromones are enabled
- a remembered or relayed coordinate, only as a bias that prefers an open neighbor closer to that point
- a relayed route segment whose start is inside sensing range

Return travel does not teleport. If the nest is visible, the agent walks toward that sensory point. Otherwise it follows its own crumbs, then home pheromone, then a local home-memory bias. Coordinates are a memory, not a live lookup of the nest after it moves. Moving the nest or the food clears the stale field and starts a new measurement window. Agents stay where they are.

Personal observations (hop count 0, learned by that agent) are available in every mode. Relayed observations are used only by CoA.

## Modes

| Mode | Pheromone | Encounter relay |
| --- | --- | --- |
| Random exploration | off | off |
| ACO-inspired baseline | on | off |
| Chaos of the Ants | on | on |

The ACO mode is a 3D baseline inspired by pheromone ACO: dual fields, local probabilistic exploitation, evaporation, and reinforcement after a delivery. It is **not** a verbatim reproduction of Ant System, Ant Colony System, or Max-Min Ant System. Use it as a matched control. The relay checkbox switches between CoA and that pheromone-only baseline without changing the maze or the seed.

There is also a relay-only corner if you disable pheromones in code. The three buttons above are the supported experimental presets.

## Mazes

**Generate 3D maze** advances the seed by 9973 and builds a new connected maze, so each click is different. **Rebuild current seed** repeats the seed in the field.

- **Recursive backtracking.** Randomized depth-first carving on a 3D room grid. Passages run in X, Y, and Z. Vertical connectivity is the probability of accepting a vertical step. Alternative routes punch extra openings after the perfect maze exists.
- **Recursive division.** Obstacle planes split chambers and keep randomized holes, including vertical splits when connectivity allows.
- **Random obstacle field.** Cubes, slabs, and pillars at the density slider. A tunnel is carved if the field would otherwise separate nest and food.

Every generator ends in a connectivity repair. Nest and food are placed on open cells about `16 + 1.5 × complexity` voxel steps apart (complexity 6 is about 25 steps). When vertical connectivity is on, food prefers another floor inside that distance band. The reference length stays a research measurement; agents never receive it. Agents spawn in the nest neighborhood, and they remember the nest only when it is inside sensing range with line of sight. If you edit the world into a disconnection, the reference length becomes blank and the status line says the trial is disconnected.

## Route destruction

**Destroy route** walks the strongest combined pheromone trail, picks a segment away from the nest and the food, and inserts a barrier across that segment.

1. It tries candidates that leave at least one remaining path.
2. If every candidate would disconnect the food, it still places one barrier and marks the trial **disconnected**. Recovery time stays blank in that case.
3. Pheromone inside the new solids is cleared. Breadcrumbs and route segments through those cells are dropped.

The cycle the dashboard is meant to show is chaos, discovery, order, disruption, chaos, new order. Recovery time is the simulation time from the disruption until the next delivery. It is null when no later delivery happens, or when the world was disconnected.

## Metrics

| Measurement | Definition |
| --- | --- |
| Discovery time | First simulation time any agent senses food |
| First delivery | First time food is carried into the nest volume |
| Path length | Distance walked from the previous delivery (or spawn) until pickup. This is the outbound trip, compared with the one-way reference path |
| Route efficiency | `referenceLength / bestOutbound`. Null until both exist. It can exceed 1 when a continuous walk cuts inside voxel-center segments |
| Explored volume | Percent of open voxels entered at least once |
| Knowledge exchanges | Encounter events that copied a new fact. Refreshing the same food or home version, or the same route cell, does not count again |
| Recovery | Time from disruption to the next delivery, or null |

Blank cells in the experiment table are nulls. They are not zeros.

## Experiments

The Experiment tab runs the headless engine, by default inside a Web Worker so the 3D view does not have to step those trials. If the worker fails to start, the same runner continues on the main thread in slices.

**Compare all modes** repeats random, ACO, and CoA with the same base seed, maze type, population, duration, and disruption setting. Trial `i` uses `seed + i`. Export CSV or JSON from the measured rows. Means ignore nulls and report how many trials actually produced that measurement.

A short trial that never finds food is a real result: discovery and delivery stay null, food delivered is 0, and the reference length is still reported.

## Architecture

```text
src/engine        world, agents, pheromones, exchange, mazes, collisions, experiments
src/algorithms    RandomWalk, ACO baseline, CoA
src/components    dashboard and react-three-fiber view
src/store         UI state. The engine instance lives beside the store, not inside React state
src/workers       batch trials
src/tests         connectivity, pheromones, relay, collisions, delivery, disruption, exports
```

Rendering uses `InstancedMesh` for agents, obstacles, pheromone voxels, and the exploration heatmap. Neighborhood queries use a spatial hash. The hot step reuses agent buffers (crumbs, outbound samples, visit rings) instead of allocating a path object every tick. Pheromone drawing is capped, and a heavier population or voxel count reduces how many scent voxels are uploaded. This repository does not claim a fixed frame rate; that depends on the machine and the settings.

## Controls

- Orbit, pan, and zoom. Right-drag orbits while an edit tool is active.
- Presets: isometric, top, front, side. Reset camera reapplies the current preset.
- Perspective or orthographic projection.
- Inspect switches to a fly camera.
- Space pauses or resumes.
- Slice view hides voxels above a Y layer so interior cells can be painted.

Editor tools: place nest, place food, add or remove an obstacle, paint, erase, clear obstacles, generate maze, destroy route, reset world. Nest and food cells stay open. Painting them is refused.

## Scientific limits

- Sensing is radius plus voxel line of sight, not a full visibility polygon.
- Pheromone lives on the voxel grid, so gradients are 6-connected.
- The reference path is a grid path through voxel centers, not a continuous geodesic.
- Crowding uses a light separation force that is turned off next to a visible nest or food source so agents can finish a handover.
- Energy drain is configured and tested, but the default is mild so a normal run is about search rather than starvation.
- Diffusion is optional and off by default because it flattens the local gradient.

Those are model choices. They are not hidden shortcuts that give agents the optimal path.
