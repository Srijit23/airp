import imported from './imported.json' with { type: 'json' };

// Dimensions and collision data are metres in the source's Y-up coordinate system.
const ecology = [
  ['oak', 'Oak', ['temperate woodland', 'parkland'], 28, 0.43],
  ['pine', 'Pine', ['montane woodland', 'dry uplands'], 36, 0.28],
  ['spruce', 'Spruce', ['cool montane forest', 'sheltered uplands'], 32, 0.24],
  ['birch', 'Birch', ['temperate woodland edge', 'riparian terraces'], 26, 0.17],
  ['acacia', 'Umbrella-thorn acacia', ['tropical dry woodland', 'warm lowlands'], 20, 0.32],
];

export const treeSpecies = ecology.map(([id, name, biomes, maxSlopeDegrees, radius]) => {
  const { bounds, sourceFile, sha256, triangles } = imported[id];
  const [width, height, depth] = bounds.max.map((max, axis) => max - bounds.min[axis]);
  return {
    id, name, assetId: 'showcase-' + id, modelPath: 'assets/trees/' + id + '.glb',
    source: { author: 'vinish.dev', title: sourceFile, page: 'https://vinish.dev/free-3d-models/trees',
      url: 'https://models.vinish.dev/trees/' + sourceFile + '.glb', sha256,
      license: 'CC-BY-4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' },
    dimensions: { width, height, depth }, defaultScale: 1, biomes,
    terrain: { maxSlopeDegrees, requiresDryGround: true },
    lod: { nodes: ['near', 'far'], switchMetres: 65 + height, hysteresisMetres: 8, triangles },
    collision: { type: 'vertical-cylinder', radius, height: height * 0.7 },
    rendering: { instanced: true, alphaMode: 'MASK', castsShadow: true, receivesShadow: true },
  };
});
