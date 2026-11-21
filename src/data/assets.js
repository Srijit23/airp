const textures = [
  ['meadow', 'rocky_terrain_02'],
  ['stone', 'aerial_rocks_02'],
  ['silt', 'aerial_ground_rock'],
];
export const manifest = Object.fromEntries(
  textures.flatMap(([name, source]) =>
    ['', '-surface'].map((suffix) => {
      const id = name + suffix;
      return [
        id,
        {
          id,
          type: 'texture',
          category: 'terrain',
          tags: [name],
          url: import.meta.env.BASE_URL + 'assets/terrain/' + id + '.webp',
          source: 'https://polyhaven.com/a/' + source,
          license: 'CC0-1.0',
          color: !suffix,
        },
      ];
    }),
  ),
);

for (const [id, source] of [
  ['asphalt', 'worn_asphalt'],
  ['pavers', 'floor_pavement'],
]) {
  for (const suffix of ['', '-surface']) {
    const name = id + suffix;
    manifest[name] = {
      id: name,
      type: 'texture',
      category: 'roads',
      tags: [id],
      url: import.meta.env.BASE_URL + 'assets/roads/' + name + '.webp',
      source: 'https://polyhaven.com/a/' + source,
      license: 'CC0-1.0',
      color: !suffix,
    };
  }
}
