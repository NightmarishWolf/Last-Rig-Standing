// Hand-made mission maps, written as text: one character per square.
//   .  open sea      #  land      any other character: a mark (open sea underneath) the mission
//   uses to place things, e.g. A = your outpost, P = a Picket Boat. Rows may be indented.
//   Lines starting with ; are comments (the Map Maker writes its pin labels there: "; A = Haven ...").
export function parseMap(text) {
  const rows = text.split('\n').map(r => r.trim()).filter(r => r.length && !r.startsWith(';'));
  const H = rows.length, W = Math.max(...rows.map(r => r.length));
  const land = new Array(W * H).fill(0), marks = {};
  rows.forEach((r, y) => {
    for (let x = 0; x < W; x++) {
      const c = r[x] || '.';
      if (c === '#') land[y * W + x] = 1;
      else if (c !== '.') (marks[c] ||= []).push([x, y]);
    }
  });
  return { W, H, land, marks };
}
