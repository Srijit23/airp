# AIRP · World Explorer

**AIRP now has a 94.63 km² playable world.** Start on Basin Boulevard in Kestrel Basin, walk through Linden Ward, then follow South Pass Highway through Alder Vale to the coast. Press **G** for eye-level exploration or **M** to jump to a named destination.

![Production views of Kestrel Basin, Silverpine Forest and Saltwood Strand](docs/phase3/world-survey.jpg)

### Phase 4A tree showcase

Press **M**, choose **Tree Model Showcase**, and press **G** to inspect the bark and branches at eye level. The clearing above Juniper Heights has three examples each of oak, pine, spruce, birch and umbrella-thorn acacia. Fly up and back to compare the crowns and their distance models.

[In-game screenshots](docs/trees) · [Model credits, dimensions and triangle counts](ASSETS.md#phase-4a-showcase-trees)

Run `npm test` for asset and placement checks. With Chromium installed, `npm run test:trees` exercises the production atlas, camera modes, both LODs and unloading. It writes the five species portraits and an aerial view to `test-results/trees/`.

### Phase 3 environment

| World feature | Shipped coverage |
| --- | --- |
| Playable footprint | 9,728 × 9,728 m with streamed terrain, collision queries and atlas navigation |
| Developed area | 443 buildings across 14 named planning districts, including all 183 original building parcels |
| Architecture | 60 imported Kenney base models and six original designs for villas, a school, a medical building and a civic hall |
| Streets | 121 connected road segments and 19.54 km of centerline. Regional routes add 9.56 km beyond the Phase 2 network. |
| Landscape and water | Instanced broadleaf trees, conifers, palms, shrubs and ground plants. The southern coastline has wet sand, animated waves and an accessible boardwalk. Twenty-nine properties have pool basins with independently animated water. |

The built-up areas follow the basin-to-coast corridor. Much of the northern and western terrain is forest or high ground. Buildings have exterior shells, foundations, street-facing access records and ground-camera collision proxies. Specialist city interiors, traffic and characters are future work.

## Run locally

Use Node.js 22.12+ and a desktop browser with WebGL2 enabled.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. To serve the production build locally, run `npm run build` and then `npm run preview`. Static hosting can serve the contents of `dist/` over HTTP or HTTPS. Vite uses relative asset paths for subdirectory deployments. All terrain maps, libraries and the generation worker ship with the build.

## Inspection controls

| Action | Input |
| --- | --- |
| Fly forward, backward or sideways | W, A, S, D |
| Look | Click the scene, then move the mouse. Arrow keys also rotate the camera. Drag on a touch screen. |
| Climb / descend | Space / C or Ctrl |
| Boost / change base speed | Shift / mouse wheel |
| Switch flight and eye-level inspection | G or Explorer settings |
| Open the city atlas | M or the minimap. Drag to pan, scroll to zoom, click to relocate. Named survey stations are available below the map. |
| Inspect frame time, coordinates and residency | F3 or Explorer settings |
| Inspect streets and building plots | Open the atlas, expand Planning overlays, and choose centerlines, boundaries, junctions, zoning, parcels, connectivity grading limits, building footprints, collision boxes or vegetation boundaries. Selections also appear in 3D. |
| Show chunk borders | Explorer settings → Chunk boundaries |
| Release the mouse / dismiss a panel | Esc |

The compass and both maps use north as negative Z. Altitude is elevation above the world datum in metres. The speed readout shows the configured travel rate before boost.

## World and rendering

The playable boundary spans 9,728 metres on each axis. The original 2,048 m Kestrel survey retains its coordinate system. Both the near-tile window and the coarse terrain window follow the camera across the world.

| System | Implementation |
| --- | --- |
| Engine | Three.js WebGL2, Vite, ACES tone mapping, hemisphere light, directional sunlight and a camera-relative sky. Near-field shadows update when their coverage or geometry changes. |
| Terrain | A seeded world-space height field combines authored ridges, gullies and an alluvial terrace. Three locally hosted, scanned ground materials blend by slope and terrain variation. Colour, tangent-normal and roughness detail share world-space coordinates. |
| Streaming | Two module workers prepare transferable typed arrays. Each coarse sector covers 4 × 4 chunks. A coarse patch stays visible until its detailed mesh arrives. A single main-thread update swaps coverage. The renderer limits geometry activations per frame, drops stale work and disposes evicted geometry. |
| Seam handling | Chunks measure 256 m. The 8-, 16- and 32-subdivision meshes share a 32 m boundary profile. A triangulated transition ring connects each interior to that profile. Adjacent chunks sample the same world-space heights and normals. |
| Inspection | Pointer-lock flight, keyboard look, terrain-following ground mode at 1.72 m, contour atlas and minimap. The atlas is generated from the same elevation field as the 3D mesh. |
| Assets | A manifest and reference-counted cache share textures and glTF resources. Loads are deduplicated, failed entries can be retried, and the last handle releases shared GPU resources. |

| Preset | Detailed chunk window | Coarse sectors | Shadow map | Maximum DPR |
| --- | ---: | ---: | ---: | ---: |
| Low | 5 × 5 | 5 × 5 | Off | 1.0 |
| Medium | 7 × 7 | 5 × 5 | 1,024² | 1.4 |
| High | 9 × 9 | 7 × 7 | 2,048² | 1.75 |

Adaptive resolution can lower the render scale under sustained load. The HUD stays at display resolution. Coarse-sector indices under active detail tiles are masked. GPU triangle submission counters include these degenerate triangles. Browser GPU resource counts are available in the overlay.

## Integration points

- `src/places/` contains the independent placement records, architectural templates, GPU material setup and instanced renderer. Sixty imported buildings have simplified distance meshes. Near-field furnishings and vegetation use preset-specific view distances. The plant cache keeps at most 140 spatial cells.
- `src/environment/water.js` owns the coastal surface, underwater fog and separate pool shader. The beach boardwalk exposes deck-height queries to the ground camera.


- `src/data/world.js` defines the seed, metre scale, playable bounds, target envelope, stable identifiers, stations and quality budgets.
- `src/terrain/field.js` owns the underlying terrain shape. The road grading field feeds mesh generation and collision queries. Future building pads should use the same interface.
- `src/world/queries.js` exposes `groundHeight(x, z)` and `surfaceAt(x, z)` without importing the renderer. Ground height interpolates the actual triangles of the canonical near mesh. The inspector passes the resident resolution to follow the visible surface during streaming. Surface metadata includes district, persistent tile ID, normal and slope.
- `src/world/streamer.js` owns residency. Future environment layers can key placements, collisions and navigation links by signed tile coordinates. Keep placed-object IDs independent of mesh lifetime and LOD.
- `src/data/assets.js` and `src/core/assets.js` handle assets separately from placements. Register glTF assets with local URLs, source/license and import scale/orientation. Keep each acquired handle until all its instances have left the scene. Add dimensions, collision proxies and entrance data when adding buildings.
- `src/debug/` contains the temporary camera, map and inspection UI. A future character controller can provide the camera position to the streamer and use the world queries independently.

## Verification

```sh
npm test
npx playwright-core install chromium
npm run test:browser
```

The browser check builds the production app, starts isolated local servers, opens real WebGL2 contexts and exercises both the production entry point and development instrumentation. To use an existing Chromium executable, set `CHROME_PATH`. For a headless software-rendering environment, set `AIRP_SOFTWARE_GL=1`. Screenshots are written to `test-results/`.

The numerical suite checks shared heights and normals in both directions at every LOD pairing, manifold topology, full chunk area, ground-to-mesh agreement, deterministic reloads, a gentle planning terrace, bounded residency, stale work, disposal and asset reference counts.

### Recorded Phase 1 run

| Check | Result |
| --- | --- |
| Automated numerical and lifecycle tests | 8 passed |
| Production and development browser checks | Passed in headless Chromium 143 with WebGL2. Pointer-lock flight, boosted flight across three chunk boundaries, ground following, atlas travel and all three presets were exercised. |
| Streaming soak | Two circuits from the overlook through three district corners and preset changes produced 500 mesh activations and 524 evictions after the initial medium window was populated. On both warmed returns, the same view held 49 detail chunks, 25 coarse sectors, 48 uploaded geometries and 8 GPU textures. |
| Visual inspection | Aerial, ground-level and boundary-overlay views were checked. The automated screenshot check also detects a cleared drawing buffer during resolution changes. |
| Medium overlook workload | 32 main-pass draw calls and 42,480 submitted triangles. An isolated 40-frame sample averaged 149 ms/frame (6.7 FPS) in CPU-based SwiftShader at a 960 × 600 viewport and a 624 × 390 adaptive render buffer. |

The hardware target is 60 FPS at 1080p Medium on a desktop with a GTX 1650-class GPU and 16 GB RAM. A hardware-backed benchmark is still pending. The software-renderer result establishes rendering correctness and a reproducible workload.

## Terrain assets

The committed WebP files are ready for use. To rebuild them, install Python 3 and Pillow and run `python scripts/prepare-terrain.py`. The script fetches 1K source maps and stores local colour textures and packed normal-XY / roughness textures. Source attribution is in [ASSETS.md](ASSETS.md).

## Kestrel Basin road and parcel design

Phase 2 established 92 road segments in the original survey, serving the six allocations below. Phase 3 connects its highway gateway and pedestrian network to the southern towns. Drivers keep left.

The road cross-sections range from 2.75 m residential lanes to 3.6 m highway lanes. Basin Boulevard has six lanes, Meridian Avenue has four, and Juniper Heights winds around the western bench. Orchard Circle has a clockwise circulating lane, raised island, mountable apron and approach refuges. Footways, curb ramps, gutter channels, drain grates, arrows, crossings, signs, signals and parking bays share the road geometry batches.

| Allocation | Phase 3 building sites |
| --- | ---: |
| Exchange Quarter, downtown | 22 |
| Linden Ward, residential | 95 |
| Juniper Heights, luxury residential | 20 |
| Market District, commercial | 29 |
| Civic Gardens, public facilities | 3 |
| Foundry Ward, industrial | 14 |
| **Total** | **183** |

Four additional parcels are in use as parking courts. Orchard Park, Orchard Playfield and Park Crescent Greenway are protected reservations. The civic sites reserve a hospital, a school and a civic hall.

### Geometry, grading and streaming

- `src/roads/layout.js` contains the authored street chains, shared junction nodes and cross-sections. `network.js` samples cubic curves, computes station distances and defines the engineered street elevations.
- The original elevation field remains available as `naturalElevation(x,z)`. Grading takes effect around road corridors and blends back to native topography. The graded bench accounts for the widest terrain LOD stencil. Plane changes occur on tile boundaries so the near, medium and far meshes all support the same road elevation.
- `junctions.js` gives adjacent roads shared mouth sections and rounded curb returns. `build.js` generates pavement, roadside detail, parking and markings. `mesh-writer.js` clips the primitives to the terrain's 256 m tiles before centimetre quantization.
- Vite compiles the plan into compressed, same-origin tile files. The browser streams base surfaces farther than small details, uses a shared road material, caps concurrent requests and keeps a bounded 12 MiB decoded-data cache. Unloaded render geometry is disposed. `RoadLayer.surfaceHeight` resolves the actual road, curb, island or sidewalk triangles for eye-level exploration.
- The atlas and ground queries cover the full envelope. Forest placement and road metadata use the same world coordinates.

### Placement and navigation data

A build exports `city/parcels.json` with metre units, stable IDs, zoning, program, elevations, corners, road frontage, entrance, yaw, setbacks, height limits and maximum footprint. The runtime also exports the same records from `src/roads/parcels.js`. Only records with `use === 'building'` are building sites. The buildable polygon is `envelope`. Yaw is in radians for a model whose front faces local +Z.

The Vite build also exports `city/buildings.json`. Each record references a parcel and asset, stores a world-space transform and lists its collision bounds and frontage access. The render layer can evict every instance without changing any of these records.

`src/roads/navigation.js` exports 310 directed lane centerlines, 226 sidewalk paths, 184 crossings, vehicle and pedestrian graphs and a shortest-path function. Graph edges carry geometry, lengths and traversal types. Each site has a pedestrian destination named `parcel.id + '/entrance'`. Each parking court also has a vehicle destination named `parcel.id + '/parking'`. South Pass Highway connects the basin to Port Mariner.

### Phase 2 verification

The 15 automated tests include the original eight terrain, streaming and asset checks. They cover network connectivity, gradients, junction caps, frontage and zoning, walk and drive access, terrain agreement at all three LODs, deterministic mesh compilation and matching asphalt boundaries across tiles. The steepest sampled road centerline is **6.94%**.

The production browser test visits the boulevard, rotary, hillside route and overview, exercises all seven overlays, and repeats the Phase 1 travel and resource checks with the road layer active. Screenshot captures are saved by `npm run test:browser`. These historical results correspond to the Phase 2 build.

At Meridian Junction the Medium preset submitted 37 main-pass draw calls and 86,057 triangles. The software-rendered Chromium run held 49 detail terrain chunks, 25 horizon sectors and 28 road batches at this station. This workload is a baseline for comparing future Phase 3 asset imports.
