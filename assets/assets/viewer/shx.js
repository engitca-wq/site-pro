// AutoCAD SHX fonts (shapes 1.0/1.1, bigfont 1.0, unifont 1.0) drawn as lines,
// the way AutoCAD draws them, so text looks exactly like the original drawing
// (Arabic SHX fonts included, which map Latin keys to Arabic letter shapes).

const DIRS = [
  [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [-0.5, 1], [-1, 1], [-1, 0.5],
  [-1, 0], [-1, -0.5], [-1, -1], [-0.5, -1], [0, -1], [0.5, -1], [1, -1], [1, -0.5],
];

/** Parses an SHX file. Returns null when it is not a text font we can read. */
export function parseShx(buf) {
  const b = new Uint8Array(buf);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 0;
  while (i < Math.min(b.length, 40) && b[i] !== 0x1a) i++;
  if (i >= b.length) return null;
  const head = new TextDecoder("latin1").decode(b.subarray(0, i)).trim().toLowerCase();
  let off = i + 1;
  const shapes = new Map();
  let kind, info;
  try {
    if (head.includes("unifont")) {
      kind = "unifont";
      const count = dv.getUint32(off, true),
        ilen = dv.getUint16(off + 4, true);
      info = b.subarray(off + 6, off + 6 + ilen);
      off += 6 + ilen;
      for (let k = 1; k < count && off + 4 <= b.length; k++) {
        const code = dv.getUint16(off, true),
          len = dv.getUint16(off + 2, true);
        shapes.set(code, b.subarray(off + 4, off + 4 + len));
        off += 4 + len;
      }
    } else if (head.includes("bigfont")) {
      kind = "bigfont";
      const count = dv.getUint16(off + 2, true),
        nr = dv.getUint16(off + 4, true);
      off += 6;
      const ranges = [];
      for (let k = 0; k < nr; k++, off += 4) ranges.push([dv.getUint16(off, true), dv.getUint16(off + 2, true)]);
      for (let k = 0; k < count && off + 8 <= b.length; k++, off += 8) {
        const code = dv.getUint16(off, true),
          len = dv.getUint16(off + 2, true),
          at = dv.getUint32(off + 4, true);
        if (!len || at + len > b.length) continue;
        if (code === 0) info = b.subarray(at, at + len);
        else shapes.set(code, b.subarray(at, at + len));
      }
      var escapes = ranges;
    } else if (head.includes("shapes")) {
      kind = "shapes";
      const count = dv.getUint16(off + 4, true);
      off += 6;
      const idx = [];
      for (let k = 0; k < count; k++, off += 4) idx.push([dv.getUint16(off, true), dv.getUint16(off + 2, true)]);
      for (const [code, len] of idx) {
        const def = b.subarray(off, off + len);
        off += len;
        if (code === 0) info = def;
        else shapes.set(code, def);
      }
    } else return null;
  } catch {
    return null;
  }
  // Font info: name\0 then above, below, modes...
  let above = 0,
    below = 0;
  if (info) {
    let z = info.indexOf(0);
    if (z >= 0 && z + 2 < info.length) (above = info[z + 1]), (below = info[z + 2]);
  }
  if (!above) above = guessAbove(shapes);
  if (!shapes.size) return null;
  return new ShxFont(kind, shapes, above || 1, below, escapes ?? []);
}

/** Fonts without a font-info shape: use the height of capital A. */
function guessAbove(shapes) {
  const f = new ShxFont("shapes", shapes, 1, 0, []);
  const g = f.glyph(65);
  let top = 0;
  for (const s of g?.strokes ?? []) for (let k = 1; k < s.length; k += 2) top = Math.max(top, s[k]);
  return top || 10;
}

class ShxFont {
  constructor(kind, shapes, above, below, escapes) {
    this.kind = kind;
    this.shapes = shapes;
    this.above = above;
    this.below = below;
    this.escapes = escapes;
    this.cache = new Map();
  }

  /** Strokes ([x0,y0,x1,y1,...] in font units) and advance of one character. */
  glyph(code) {
    let g = this.cache.get(code);
    if (g !== undefined) return g;
    const def = this.shapes.get(code);
    g = def ? this.run(def, 0) : null;
    this.cache.set(code, g);
    return g;
  }

  run(def, depth) {
    const st = { x: 0, y: 0, pen: true, scale: 1, stack: [], strokes: [], cur: null };
    this.exec(def, def.indexOf(0) + 1, st, depth);
    return { strokes: st.strokes, adv: st.x };
  }

  exec(d, i, st, depth) {
    const sb = (v) => (v > 127 ? v - 256 : v);
    const move = (nx, ny) => {
      if (st.pen) {
        if (!st.cur) st.strokes.push((st.cur = [st.x, st.y]));
        st.cur.push(nx, ny);
      } else st.cur = null;
      st.x = nx;
      st.y = ny;
    };
    const arc = (cx, cy, r, a0, sweep) => {
      const n = Math.max(2, Math.ceil((Math.abs(sweep) / (Math.PI / 4)) * 2));
      for (let k = 1; k <= n; k++) {
        const a = a0 + (sweep * k) / n;
        move(cx + r * Math.cos(a), cy + r * Math.sin(a));
      }
    };
    const bulge = (dx, dy, bv) => {
      dx *= st.scale;
      dy *= st.scale;
      const ex = st.x + dx,
        ey = st.y + dy;
      if (!bv) return move(ex, ey);
      const bb = bv / 127,
        ang = 4 * Math.atan(bb),
        chord = Math.hypot(dx, dy),
        r = chord / (2 * Math.sin(Math.abs(ang) / 2)),
        mx = st.x + dx / 2,
        my = st.y + dy / 2,
        h = r * Math.cos(ang / 2) * Math.sign(bb),
        cx = mx - (dy / chord) * h,
        cy = my + (dx / chord) * h;
      arc(cx, cy, r, Math.atan2(st.y - cy, st.x - cx), ang);
      st.x = ex;
      st.y = ey;
    };
    const wide = this.kind !== "shapes";
    let skip = false;
    while (i < d.length) {
      const c = d[i++];
      const before = i;
      if (c === 0) break;
      const doIt = !skip;
      skip = false;
      if (c > 15) {
        if (doIt) {
          const len = (c >> 4) * st.scale,
            v = DIRS[c & 15];
          move(st.x + v[0] * len, st.y + v[1] * len);
        }
        continue;
      }
      switch (c) {
        case 1: doIt && ((st.pen = true), (st.cur = null)); break;
        case 2: doIt && ((st.pen = false), (st.cur = null)); break;
        case 3: doIt && (st.scale /= d[i] || 1); i++; break;
        case 4: doIt && (st.scale *= d[i] || 1); i++; break;
        case 5: doIt && st.stack.push([st.x, st.y]); break;
        case 6:
          if (doIt) {
            const p = st.stack.pop();
            if (p) (st.x = p[0]), (st.y = p[1]), (st.cur = null);
          }
          break;
        case 7: {
          let code;
          if (wide) {
            code = (d[i] << 8) | d[i + 1];
            i += 2;
            if (this.kind === "bigfont" && code === 0) i += 4; // extended subshape: origin, size
          } else code = d[i++];
          if (doIt && depth < 8) {
            const sub = this.shapes.get(code);
            if (sub) {
              const save = st.scale;
              this.exec(sub, sub.indexOf(0) + 1, st, depth + 1);
              st.scale = save;
              st.cur = null;
            }
          }
          break;
        }
        case 8: {
          const dx = sb(d[i]),
            dy = sb(d[i + 1]);
          i += 2;
          doIt && move(st.x + dx * st.scale, st.y + dy * st.scale);
          break;
        }
        case 9:
          while (i + 1 < d.length) {
            const dx = sb(d[i]),
              dy = sb(d[i + 1]);
            i += 2;
            if (!dx && !dy) break;
            doIt && move(st.x + dx * st.scale, st.y + dy * st.scale);
          }
          break;
        case 10: {
          // Octant byte: bit 7 = clockwise, bits 4-6 = start octant, bits 0-2 = span.
          const r = d[i] * st.scale,
            o = d[i + 1];
          i += 2;
          if (doIt) {
            const start = ((o >> 4) & 7) * (Math.PI / 4),
              span = ((o & 7) || 8) * (Math.PI / 4) * (o & 0x80 ? -1 : 1),
              cx = st.x - r * Math.cos(start),
              cy = st.y - r * Math.sin(start);
            arc(cx, cy, r, start, span);
          }
          break;
        }
        case 11: {
          const so = d[i],
            eo = d[i + 1],
            r = (d[i + 2] * 256 + d[i + 3]) * st.scale,
            o = d[i + 4];
          i += 5;
          if (doIt) {
            const cw = !!(o & 0x80),
              so8 = (o >> 4) & 7,
              span = o & 7 || 8,
              q = Math.PI / 4,
              a0 = so8 * q + (so * q) / 256,
              a1 = (cw ? so8 - span + 1 : so8 + span - 1) * q + (eo * q) / 256;
            let sweep = a1 - a0;
            if (!cw && sweep <= 0) sweep += 2 * Math.PI;
            if (cw && sweep >= 0) sweep -= 2 * Math.PI;
            const cx = st.x - r * Math.cos(a0),
              cy = st.y - r * Math.sin(a0);
            arc(cx, cy, r, a0, sweep);
          }
          break;
        }
        case 12: {
          const dx = sb(d[i]),
            dy = sb(d[i + 1]),
            bv = sb(d[i + 2]);
          i += 3;
          doIt && bulge(dx, dy, bv);
          break;
        }
        case 13:
          while (i + 1 < d.length) {
            const dx = sb(d[i]),
              dy = sb(d[i + 1]);
            i += 2;
            if (!dx && !dy) break;
            const bv = sb(d[i++]);
            doIt && bulge(dx, dy, bv);
          }
          break;
        case 14:
          skip = true; // next command is for vertical text only
          break;
        default:
          break;
      }
      void before;
    }
  }

  /** Character codes for a string: Unicode for unifonts, code-page bytes otherwise. */
  codes(str, enc) {
    const out = [];
    if (this.kind === "unifont") {
      for (const ch of str) out.push(ch.codePointAt(0));
      return out;
    }
    const bytes = [];
    for (const ch of str) {
      const u = ch.codePointAt(0);
      const sp = SPECIAL[u];
      if (sp) bytes.push(sp);
      else if (u < 128) bytes.push(u);
      else {
        const e = enc(u);
        if (e !== undefined) bytes.push(e);
        else bytes.push(63);
      }
    }
    return bytes;
  }
}

// %%d, %%p, %%c in non-Unicode AutoCAD fonts.
const SPECIAL = { 0xb0: 127, 0xb1: 128, 0x2205: 129, 0x2300: 129 };

let encMap = null;
/** Unicode -> Windows-1256 byte (the Arabic AutoCAD code page). */
function cp1256(u) {
  if (!encMap) {
    encMap = new Map();
    const dec = new TextDecoder("windows-1256");
    for (let b = 128; b < 256; b++) encMap.set(dec.decode(new Uint8Array([b])).codePointAt(0), b);
  }
  return encMap.get(u);
}

/**
 * Lays out one line of text with a main font and optional big font.
 * Returns strokes in text units (cap height = 1) and the line width.
 */
export function shxLine(str, font, big) {
  const codes = font.codes(str, cp1256);
  const k = 1 / font.above;
  const strokes = [];
  let x = 0;
  for (let n = 0; n < codes.length; n++) {
    let c = codes[n],
      f = font;
    if (big && n + 1 < codes.length && big.escapes.some(([a, b]) => c >= a && c <= b)) {
      c = (c << 8) | codes[++n];
      f = big;
    }
    if (c === 32 && !f.shapes.has(32)) {
      x += font.above * 0.6 * k;
      continue;
    }
    let g = f.glyph(c);
    if (!g && f !== font) g = font.glyph(c);
    if (!g) {
      x += 0.6;
      continue;
    }
    const s = f === font ? k : 1 / (big.above || font.above);
    for (const st of g.strokes) {
      const p = new Array(st.length);
      for (let j = 0; j < st.length; j += 2) (p[j] = x + st[j] * s), (p[j + 1] = st[j + 1] * s);
      strokes.push(p);
    }
    x += g.adv * s;
  }
  return { strokes, width: x };
}
