const paths = {
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zm6-2v16m6-14v16"/>',
  sliders:
    '<path d="M3 7h5m4 0h9M3 17h11m4 0h3"/><circle cx="10" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  expand: '<path d="M14 4h6v6m0-6-7 7M4 14v6h6m-6 0 7-7"/>',
  altitude: '<path d="m2 19 7-10 4 5 3-8 6 13z"/>',
  speed:
    '<path d="M3 17a9 9 0 1 1 18 0M12 14l5-5"/><circle cx="12" cy="15" r="1.5"/>',
  mouse: '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 3v6"/>',
  keyboard:
    '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M5 9h1m3 0h1m3 0h1m3 0h1M6 13h1m3 2h6"/>',
};
export function icons() {
  document.querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      paths[el.dataset.icon] +
      '</svg>';
  });
}
