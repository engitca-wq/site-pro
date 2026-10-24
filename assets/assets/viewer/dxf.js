// DXF reader for the Site Pro drawing viewer.
//
// Reads an ASCII DXF (also the DXF that LibreDWG writes for a DWG) straight
// from bytes, chunk by chunk, and returns the viewer's drawing model:
//
//   { units, ltscale, layers, ltypes, blocks, entities, layouts, skipped, notes }
//
// Every entity is converted to world (WCS) x/y here, including mirrored
// entities (extrusion 0,0,-1), so the renderer never has to know about OCS.

const D2R = Math.PI / 180;

// ---------------------------------------------------------------- encoding

const CODEPAGES = {
  ANSI_874: "windows-874",
  ANSI_932: "shift_jis",
  ANSI_936: "gbk",
  ANSI_949: "euc-kr",
  ANSI_950: "big5",
  ANSI_1250: "windows-1250",
  ANSI_1251: "windows-1251",
  ANSI_1252: "windows-1252",
  ANSI_1253: "windows-1253",
  ANSI_1254: "windows-1254",
  ANSI_1255: "windows-1255",
  ANSI_1256: "windows-1256",
  ANSI_1257: "windows-1257",
  ANSI_1258: "windows-1258",
  DOS720: "windows-1256",
  DOS864: "ibm864",
};

function headerPeek(bytes) {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1 << 16));
  const val = (name) =>
    head
      .match(
        new RegExp("\\" + name + "\\s*\\r?\\n\\s*\\d+\\s*\\r?\\n([^\\r\\n]*)"),
      )?.[1]
      ?.trim();
  return {
    ver: val("$ACADVER") ?? "",
    codepage: (val("$DWGCODEPAGE") ?? "").toUpperCase(),
  };
}

/** Line reader over the bytes: decodes 4 MB at a time. */
class Reader {
  constructor(bytes, encoding, fatal) {
    this.bytes = bytes;
    this.dec = new TextDecoder(encoding, { fatal });
    this.off = 0;
    this.s = "";
    this.p = 0;
    this.code = -1;
    this.value = "";
    this.pushed = false;
  }
  more() {
    if (this.off >= this.bytes.length) return false;
    const end = Math.min(this.bytes.length, this.off + (4 << 20));
    const chunk = this.dec.decode(this.bytes.subarray(this.off, end), {
      stream: end < this.bytes.length,
    });
    this.off = end;
    this.s = this.s.slice(this.p) + chunk;
    this.p = 0;
    return true;
  }
  line() {
    let i = this.s.indexOf("\n", this.p);
    while (i < 0) {
      if (!this.more()) {
        if (this.p >= this.s.length) return null;
        i = this.s.length;
        break;
      }
      i = this.s.indexOf("\n", this.p);
    }
    let l = this.s.slice(this.p, i);
    this.p = i + 1;
    if (l.charCodeAt(l.length - 1) === 13) l = l.slice(0, -1);
    return l;
  }
  /** Reads the next group; returns false at the end of the file. */
  next() {
    if (this.pushed) {
      this.pushed = false;
      return true;
    }
    const c = this.line();
    if (c === null) return false;
    const v = this.line();
    if (v === null) return false;
    this.code = +c;
    if (Number.isNaN(this.code))
      throw dxfError("bad", "Bad group code: " + c.slice(0, 20));
    this.value = v;
    return true;
  }
  back() {
    this.pushed = true;
  }
  progress() {
    return this.off / this.bytes.length;
  }
}

function dxfError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// ---------------------------------------------------------------- groups

/** The groups of one record (entity / table entry / object). */
class Rec {
  constructor(type) {
    this.type = type;
    this.c = [];
    this.v = [];
  }
  idx(code, from = 0) {
    const c = this.c;
    for (let i = from; i < c.length; i++) if (c[i] === code) return i;
    return -1;
  }
  str(code, def) {
    const i = this.idx(code);
    return i < 0 ? def : this.v[i];
  }
  num(code, def = 0) {
    const i = this.idx(code);
    if (i < 0) return def;
    const n = parseFloat(this.v[i]);
    return Number.isFinite(n) ? n : def;
  }
  int(code, def = 0) {
    return Math.trunc(this.num(code, def));
  }
  pt(code, def) {
    const i = this.idx(code);
    if (i < 0) return def ?? { x: 0, y: 0 };
    return { x: +this.v[i] || 0, y: this.numAfter(code + 10, i) };
  }
  numAfter(code, i) {
    const j = this.idx(code, i);
    return j < 0 ? 0 : +this.v[j] || 0;
  }
  all(code) {
    const out = [];
    for (let i = 0; i < this.c.length; i++)
      if (this.c[i] === code) out.push(this.v[i]);
    return out;
  }
}

/** A LAYOUT's name is the group 1 under AcDbLayout; the first one is the page setup name. */
function layoutName(rec) {
  let m = -1;
  for (let i = 0; i < rec.c.length; i++)
    if (rec.c[i] === 100 && rec.v[i].trim() === "AcDbLayout") m = i;
  const i = rec.idx(1, m < 0 ? 0 : m);
  return i < 0 ? "" : rec.v[i];
}

function readRec(r, type) {
  const rec = new Rec(type);
  while (r.next()) {
    if (r.code === 0) {
      r.back();
      break;
    }
    rec.c.push(r.code);
    rec.v.push(r.value);
  }
  return rec;
}

// ---------------------------------------------------------------- text

/** Decodes \U+XXXX and \M+NXXXX escapes used in DXF strings. */
export function unescapeDxf(s) {
  if (!s || s.indexOf("\\") < 0) return s;
  return s
    .replace(/\\U\+([0-9a-fA-F]{4})/g, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    )
    .replace(/\\M\+[0-9]([0-9a-fA-F]{4})/g, (_, h) => {
      // Multibyte (MIF) escape: best effort for the common Arabic code page.
      const b = parseInt(h, 16);
      try {
        return new TextDecoder("windows-1256").decode(
          new Uint8Array([b >> 8, b & 255]),
        );
      } catch {
        return "?";
      }
    });
}

// ---------------------------------------------------------------- OCS

/** The 2D part of the OCS -> WCS matrix for an extrusion vector. */
function ocsMatrix(nx, ny, nz) {
  if (Math.abs(nx) < 1e-9 && Math.abs(ny) < 1e-9)
    return nz < 0 ? [-1, 0, 0, 1] : null;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;
  // Arbitrary axis algorithm.
  let ax, ay, az;
  if (Math.abs(nx) < 1 / 64 && Math.abs(ny) < 1 / 64)
    [ax, ay, az] = [nz, 0, -nx]; // Wy x N
  else [ax, ay, az] = [-ny, nx, 0]; // Wz x N
  const al = Math.hypot(ax, ay, az) || 1;
  ax /= al;
  ay /= al;
  az /= al;
  const bx = ny * az - nz * ay,
    by = nz * ax - nx * az;
  return [ax, ay, bx, by];
}

const mapPt = (m, p) =>
  m ? { x: m[0] * p.x + m[2] * p.y, y: m[1] * p.x + m[3] * p.y } : p;
const mapAngle = (m, a) =>
  m
    ? Math.atan2(
        m[1] * Math.cos(a) + m[3] * Math.sin(a),
        m[0] * Math.cos(a) + m[2] * Math.sin(a),
      )
    : a;
const mirrored = (m) => !!m && m[0] * m[3] - m[1] * m[2] < 0;

// ---------------------------------------------------------------- entities

const SKIP_SILENT = new Set([
  "VIEWPORT",
  "WIPEOUT",
  "ATTDEF",
  "SEQEND",
  "LIGHT",
  "SUN",
  "CAMERA",
  "ENDBLK",
]);
const NOT_DRAWABLE = {
  "3DSOLID": "مجسمات 3D",
  REGION: "Region",
  BODY: "Body",
  SURFACE: "أسطح 3D",
  MESH: "Mesh",
  ACAD_PROXY_ENTITY: "Proxy",
  SHAPE: "Shape",
  ARCALIGNEDTEXT: "نص على قوس",
  IMAGE: "صور",
  OLE2FRAME: "OLE",
  OLEFRAME: "OLE",
};

function common(rec) {
  // Only the AcDbEntity part: subclass data reuses codes like 62/8.
  const c = rec.c,
    v = rec.v;
  let n100 = 0,
    end = c.length;
  for (let i = 0; i < c.length; i++)
    if (c[i] === 100 && ++n100 === 2) {
      end = i;
      break;
    }
  const e = {
    layer: "0",
    ci: 256,
    rgb: undefined,
    lt: "BYLAYER",
    lts: 1,
    lw: -1,
    paper: false,
    hidden: false,
  };
  for (let i = 0; i < end; i++) {
    switch (c[i]) {
      case 8:
        e.layer = unescapeDxf(v[i]);
        break;
      case 6:
        e.lt = v[i].toUpperCase();
        break;
      case 62:
        e.ci = Math.abs(parseInt(v[i])) || 0;
        break;
      case 420:
        e.rgb = parseInt(v[i]) & 0xffffff;
        break;
      case 370:
        e.lw = parseInt(v[i]);
        break;
      case 48:
        e.lts = +v[i] || 1;
        break;
      case 60:
        e.hidden = v[i].trim() === "1";
        break;
      case 67:
        e.paper = v[i].trim() === "1";
        break;
      case 330:
        if (e.owner === undefined) e.owner = v[i].trim();
        break;
      case 5:
        e.handle = v[i].trim();
        break;
    }
  }
  const ex = rec.idx(210);
  e.ocs =
    ex < 0
      ? null
      : ocsMatrix(
          +rec.v[ex] || 0,
          rec.numAfter(220, ex),
          rec.numAfter(230, ex) || 1,
        );
  if (e.rgb !== undefined && e.ci !== 0) e.ci = 257; // 420 wins over the nearest-ACI 62
  return e;
}

/** LWPOLYLINE vertices with bulges, in order. */
function lwVertices(rec) {
  const out = [];
  let cur = null;
  for (let i = 0; i < rec.c.length; i++) {
    const code = rec.c[i];
    if (code === 10) out.push((cur = { x: +rec.v[i] || 0, y: 0, b: 0 }));
    else if (cur && code === 20) cur.y = +rec.v[i] || 0;
    else if (cur && code === 42) cur.b = +rec.v[i] || 0;
  }
  return out;
}

function textAtt(ha, va) {
  // TEXT/ATTRIB alignment -> MTEXT style attachment (1..9).
  if (ha === 4) return 5; // middle
  const col = ha === 1 || ha === 3 || ha === 5 ? 1 : ha === 2 ? 2 : 0;
  const row = va === 3 ? 0 : va === 2 ? 1 : 2;
  return row * 3 + col + 1;
}

function buildText(rec, e, type) {
  const vaCode = type === "TEXT" ? 73 : 74;
  const ha = rec.int(72),
    va = rec.int(vaCode);
  const aligned = ha !== 0 || va !== 0;
  let p = rec.pt(10);
  let rot = rec.num(50) * D2R;
  const p2 = rec.pt(11, null);
  let wf = rec.num(41, 1) || 1;
  if (aligned && p2) {
    if (ha === 3 || ha === 5) {
      // Aligned / fit: the text spans start -> end; place it at the middle.
      rot = Math.atan2(p2.y - p.y, p2.x - p.x);
      p = { x: (p.x + p2.x) / 2, y: (p.y + p2.y) / 2 };
    } else p = p2;
  }
  const out = {
    ...e,
    type: "TEXT",
    text: unescapeDxf(rec.str(1, "")),
    h: rec.num(40, 1) || 1,
    p: mapPt(e.ocs, p),
    rot: mapAngle(e.ocs, rot),
    att: aligned ? textAtt(ha, va) : 7,
    wf,
  };
  if (type === "ATTRIB" && rec.int(70) & 1) out.hidden = true;
  return out;
}

function hatchLoops(rec) {
  // Positional parse of the boundary paths (codes repeat per loop/edge).
  const c = rec.c,
    v = rec.v;
  let i = rec.idx(91);
  if (i < 0) return { loops: [], i: 0 };
  const nLoops = parseInt(v[i++]);
  const num = () => +v[i++] || 0;
  const seek = (code) => {
    while (i < c.length && c[i] !== code) i++;
    return i < c.length;
  };
  const loops = [];
  for (let l = 0; l < nLoops && seek(92); l++) {
    const flags = parseInt(v[i++]);
    const pts = [];
    if (flags & 2) {
      seek(72);
      const hasBulge = num();
      seek(73);
      i++;
      seek(93);
      const n = num();
      for (let k = 0; k < n && seek(10); k++) {
        const x = num();
        const y = c[i] === 20 ? num() : 0;
        let b = 0;
        if (hasBulge && c[i] === 42) b = num();
        pts.push({ x, y, b });
      }
    } else {
      seek(93);
      const n = num();
      for (let k = 0; k < n && seek(72); k++) {
        const t = num();
        if (t === 1) {
          seek(10);
          const a = { x: num(), y: num() };
          seek(11);
          const b = { x: num(), y: num() };
          if (
            !pts.length ||
            Math.hypot(
              pts[pts.length - 1].x - a.x,
              pts[pts.length - 1].y - a.y,
            ) > 1e-9
          )
            pts.push(a);
          pts.push(b);
        } else if (t === 2) {
          seek(10);
          const cx = num(),
            cy = num();
          seek(40);
          const r = num();
          seek(50);
          const a0 = num(),
            a1 = (seek(51), num());
          seek(73);
          const ccw = num();
          pts.push(...arcPts(cx, cy, r, r, 0, a0 * D2R, a1 * D2R, !!ccw));
        } else if (t === 3) {
          seek(10);
          const cx = num(),
            cy = num();
          seek(11);
          const mx = num(),
            my = num();
          seek(40);
          const ratio = num();
          seek(50);
          const a0 = num(),
            a1 = (seek(51), num());
          seek(73);
          const ccw = num();
          const R = Math.hypot(mx, my);
          pts.push(
            ...arcPts(
              cx,
              cy,
              R,
              R * ratio,
              Math.atan2(my, mx),
              a0 * D2R,
              a1 * D2R,
              !!ccw,
            ),
          );
        } else if (t === 4) {
          seek(94);
          const deg = num();
          seek(95);
          const nk = num();
          seek(96);
          const nc = num();
          const knots = [],
            ctrl = [];
          for (let q = 0; q < nk && seek(40); q++) knots.push(num());
          for (let q = 0; q < nc && seek(10); q++)
            ctrl.push({ x: num(), y: c[i] === 20 ? num() : 0 });
          pts.push(...bspline(deg || 3, ctrl, knots));
        }
      }
    }
    if (pts.length >= 2) loops.push(pts);
  }
  return { loops, i };
}

/** Points along an (elliptic) arc; clockwise arcs as stored in hatch edges. */
function arcPts(cx, cy, rx, ry, rot, a0, a1, ccw) {
  if (!ccw) [a0, a1] = [-a0, -a1];
  if (ccw) while (a1 <= a0) a1 += 2 * Math.PI;
  else while (a1 >= a0) a1 -= 2 * Math.PI;
  const n = Math.max(8, Math.ceil((Math.abs(a1 - a0) / (2 * Math.PI)) * 64));
  const cr = Math.cos(rot),
    sr = Math.sin(rot),
    out = [];
  for (let k = 0; k <= n; k++) {
    const a = a0 + ((a1 - a0) * k) / n,
      x = rx * Math.cos(a),
      y = ry * Math.sin(a);
    out.push({ x: cx + x * cr - y * sr, y: cy + x * sr + y * cr });
  }
  return out;
}

/** Points on a B-spline (de Boor); falls back to a clamped uniform knot vector. */
export function bspline(t, ctrl, knots) {
  const n = ctrl.length;
  if (n < 2) return ctrl.slice();
  t = Math.min(t, n - 1);
  if (knots.length !== n + t + 1) {
    knots = [];
    for (let r = 0; r < n + t + 1; r++)
      knots.push(r <= t ? 0 : r >= n ? n - t : r - t);
  }
  const k0 = knots[t],
    k1 = knots[n],
    steps = Math.min(600, n * 12),
    out = [];
  for (let r = 0; r <= steps; r++) {
    const x = Math.min(k0 + ((k1 - k0) * r) / steps, k1 - 1e-9);
    let l = t;
    while (l < n - 1 && knots[l + 1] <= x) l++;
    const d = [];
    for (let a = 0; a <= t; a++) d.push({ ...ctrl[a + l - t] });
    for (let a = 1; a <= t; a++)
      for (let m = t; m >= a; m--) {
        const w = m + l - t,
          den = knots[w + t - a + 1] - knots[w],
          f = den ? (x - knots[w]) / den : 0;
        d[m] = {
          x: (1 - f) * d[m - 1].x + f * d[m].x,
          y: (1 - f) * d[m - 1].y + f * d[m].y,
        };
      }
    out.push(d[t]);
  }
  return out;
}

function hatchPatterns(rec, from) {
  const c = rec.c,
    v = rec.v,
    out = [];
  let i = rec.idx(78, from);
  if (i < 0) return out;
  const n = parseInt(v[i++]);
  for (let k = 0; k < n; k++) {
    while (i < c.length && c[i] !== 53) i++;
    if (i >= c.length) break;
    const line = { a: +v[i++] * D2R, bx: 0, by: 0, ox: 0, oy: 0, dashes: [] };
    for (
      ;
      i < c.length && c[i] !== 53 && c[i] !== 47 && c[i] !== 98 && c[i] !== 450;
      i++
    ) {
      const val = +v[i] || 0;
      if (c[i] === 43) line.bx = val;
      else if (c[i] === 44) line.by = val;
      else if (c[i] === 45) line.ox = val;
      else if (c[i] === 46) line.oy = val;
      else if (c[i] === 49) line.dashes.push(val);
    }
    out.push(line);
  }
  return out;
}

function mleader(rec, e, header) {
  // MULTILEADER: leader lines + mtext, read from CONTEXT_DATA{ ... }.
  const c = rec.c,
    v = rec.v;
  const out = {
    ...e,
    type: "MLEADER",
    leaders: [],
    text: "",
    tp: null,
    th: 1,
    arrow: 0,
    tw: 0,
    att: 1,
    tdir: 0,
  };
  let depth = 0,
    leader = null,
    line = null;
  for (let i = 0; i < c.length; i++) {
    const code = c[i],
      val = v[i];
    if (
      code === 300 ||
      code === 302 ||
      (code === 304 && val === "LEADER_LINE{")
    ) {
      depth++;
      if (code === 302)
        out.leaders.push(
          (leader = { lines: [], last: null, dog: null, dogLen: 0 }),
        );
      if (code === 304) leader?.lines.push((line = []));
      continue;
    }
    if (code === 301 || code === 303 || code === 305) {
      depth--;
      if (code === 305) line = null;
      if (code === 303) leader = null;
      continue;
    }
    if (line) {
      if (code === 10) line.push({ x: +val || 0, y: +v[i + 1] || 0 });
    } else if (leader) {
      if (code === 10) leader.last = { x: +val || 0, y: +v[i + 1] || 0 };
      else if (code === 11) leader.dog = { x: +val || 0, y: +v[i + 1] || 0 };
      else if (code === 40) leader.dogLen = +val || 0;
    } else if (depth > 0) {
      if (code === 304 && val !== "LEADER_LINE{") out.text += val;
      else if (code === 12) out.tp = { x: +val || 0, y: +v[i + 1] || 0 };
      else if (code === 41) out.th = +val || 1;
      else if (code === 140) out.arrow = +val || 0;
      else if (code === 13) out.tdir = Math.atan2(+v[i + 1] || 0, +val || 1);
      else if (code === 43) out.tw = +val || 0;
    }
  }
  out.text = unescapeDxf(out.text);
  if (!out.arrow) out.arrow = header.arrow;
  return out;
}

function mline(rec, e, styles) {
  const c = rec.c,
    v = rec.v;
  const style =
    styles[rec.str(340, "").trim()] ??
    styles[(rec.str(2, "") || "").toUpperCase()];
  const nEl = rec.int(73);
  const lines = Array.from({ length: nEl }, () => []);
  for (let i = 0; i < c.length; i++) {
    if (c[i] !== 11) continue;
    const vx = { x: +v[i] || 0, y: +v[i + 1] || 0 };
    let j = rec.idx(13, i);
    const mx = +v[j] || 0,
      my = rec.numAfter(23, j);
    j++;
    for (let el = 0; el < nEl; el++) {
      j = rec.idx(74, j);
      if (j < 0) break;
      const np = parseInt(v[j++]);
      const off = np > 0 && c[j] === 41 ? +v[j] || 0 : 0;
      lines[el].push({ x: vx.x + mx * off, y: vx.y + my * off });
      j = rec.idx(75, j);
      if (j < 0) break;
      j++;
    }
  }
  return {
    ...e,
    type: "MLINE",
    lines: lines.map((pts, k) => ({
      pts,
      ci: style?.[k]?.ci,
      lt: style?.[k]?.lt,
    })),
    closed: !!(rec.int(71) & 2),
  };
}

function entity(rec, ctx) {
  const type = rec.type;
  const e = common(rec);
  if (e.hidden) return null;
  const P = (code, def) => mapPt(e.ocs, rec.pt(code, def));
  switch (type) {
    case "LINE":
      return { ...e, type, pts: [rec.pt(10), rec.pt(11)] };
    case "POINT":
      return { ...e, type, p: rec.pt(10) };
    case "CIRCLE":
      return { ...e, type, c: P(10), r: rec.num(40) };
    case "ARC": {
      let a0 = rec.num(50) * D2R,
        a1 = rec.num(51) * D2R;
      if (e.ocs) {
        const m0 = mapAngle(e.ocs, a0),
          m1 = mapAngle(e.ocs, a1);
        [a0, a1] = mirrored(e.ocs) ? [m1, m0] : [m0, m1];
      }
      return { ...e, type, c: P(10), r: rec.num(40), a0, a1 };
    }
    case "ELLIPSE": {
      const ex = rec.idx(210);
      const flip = ex >= 0 && rec.numAfter(230, ex) < 0;
      let a0 = rec.num(41),
        a1 = rec.num(42, 2 * Math.PI);
      const major = rec.pt(11);
      // Mirrored ellipse: the minor axis points the other way, so mirror the parameters.
      if (flip) [a0, a1] = [-a1, -a0];
      return {
        ...e,
        ocs: null,
        type,
        c: rec.pt(10),
        major,
        ratio: rec.num(40, 1),
        a0,
        a1,
      };
    }
    case "LWPOLYLINE": {
      const flip = mirrored(e.ocs);
      const pts = lwVertices(rec).map((p) => ({
        ...mapPt(e.ocs, p),
        b: flip ? -p.b : p.b,
      }));
      return { ...e, type, pts, closed: !!(rec.int(70) & 1), w: rec.num(43) };
    }
    case "POLYLINE":
      return {
        ...e,
        type,
        flags: rec.int(70),
        m: rec.int(71),
        n: rec.int(72),
        verts: [],
      };
    case "SPLINE": {
      const ctrl = [],
        fit = [];
      for (let i = 0; i < rec.c.length; i++) {
        if (rec.c[i] === 10)
          ctrl.push({
            x: +rec.v[i] || 0,
            y: rec.c[i + 1] === 20 ? +rec.v[i + 1] || 0 : 0,
          });
        else if (rec.c[i] === 11)
          fit.push({
            x: +rec.v[i] || 0,
            y: rec.c[i + 1] === 21 ? +rec.v[i + 1] || 0 : 0,
          });
      }
      return {
        ...e,
        type,
        degree: rec.int(71, 3),
        ctrl,
        fit,
        knots: rec.all(40).map(Number),
        closed: !!(rec.int(70) & 1),
      };
    }
    case "HELIX": {
      const ctrl = [];
      for (let i = 0; i < rec.c.length; i++)
        if (rec.c[i] === 10)
          ctrl.push({ x: +rec.v[i] || 0, y: +rec.v[i + 1] || 0 });
      return {
        ...e,
        type: "SPLINE",
        degree: rec.int(71, 3),
        ctrl,
        fit: [],
        knots: rec.all(40).map(Number),
      };
    }
    case "TEXT":
    case "ATTRIB":
      return buildText(rec, e, type);
    case "MTEXT": {
      let text = rec.all(3).join("") + (rec.str(1, "") ?? "");
      const xi = rec.idx(11);
      const rot =
        xi >= 0
          ? Math.atan2(rec.numAfter(21, xi), +rec.v[xi] || 0)
          : rec.num(50);
      return {
        ...e,
        type,
        text: unescapeDxf(text),
        h: rec.num(40, 1) || 1,
        p: rec.pt(10),
        rot,
        att: rec.int(71, 1) || 1,
        w: rec.num(41),
        ls: rec.num(44, 1) || 1,
      };
    }
    case "INSERT":
      return {
        ...e,
        type,
        name: unescapeDxf(rec.str(2, "")),
        p: rec.pt(10),
        sx: rec.num(41, 1) || 1,
        sy: rec.num(42, 1) || 1,
        rot: rec.num(50) * D2R,
        cols: Math.max(1, rec.int(70, 1)),
        rows: Math.max(1, rec.int(71, 1)),
        dc: rec.num(44),
        dr: rec.num(45),
        attribs: [],
      };
    case "ACAD_TABLE": {
      const xi = rec.idx(11);
      return {
        ...e,
        type: "INSERT",
        name: unescapeDxf(rec.str(2, "")),
        p: rec.pt(10),
        sx: 1,
        sy: 1,
        rot: xi >= 0 ? Math.atan2(rec.numAfter(21, xi), +rec.v[xi] || 1) : 0,
        cols: 1,
        rows: 1,
        dc: 0,
        dr: 0,
        attribs: [],
        table: true,
      };
    }
    case "DIMENSION":
    case "ARC_DIMENSION":
    case "LARGE_RADIAL_DIMENSION": {
      const m = rec.num(42, NaN);
      return {
        ...e,
        type: "DIMENSION",
        name: unescapeDxf(rec.str(2, "")),
        tp: rec.pt(11, null),
        measure: m,
        label: rec.str(1, ""),
      };
    }
    case "HATCH": {
      const { loops, i } = hatchLoops(rec);
      const flip = mirrored(e.ocs);
      const solid = rec.int(70) === 1 || rec.int(450) === 1;
      const patterns = solid ? [] : hatchPatterns(rec, i);
      const ml = (p) => ({
        ...mapPt(e.ocs, p),
        b: flip ? -(p.b || 0) : p.b || 0,
      });
      if (e.ocs)
        for (const pat of patterns) {
          const b = mapPt(e.ocs, { x: pat.bx, y: pat.by }),
            o = mapPt(e.ocs, { x: pat.ox, y: pat.oy });
          Object.assign(pat, {
            a: mapAngle(e.ocs, pat.a),
            bx: b.x,
            by: b.y,
            ox: o.x,
            oy: o.y,
          });
        }
      return {
        ...e,
        type,
        solid: solid || !patterns.length,
        loops: loops.map((l) => l.map(ml)),
        patterns,
        name: rec.str(2, ""),
      };
    }
    case "SOLID":
    case "TRACE": {
      const pts = [P(10), P(11), P(13, P(12)), P(12)];
      return { ...e, type: "SOLID", pts };
    }
    case "3DFACE":
      return {
        ...e,
        type: "FACE",
        pts: [rec.pt(10), rec.pt(11), rec.pt(12), rec.pt(13, rec.pt(12))],
        edges: rec.int(70),
      };
    case "XLINE":
    case "RAY":
      return { ...e, type, p: rec.pt(10), dir: rec.pt(11) };
    case "LEADER": {
      const pts = [];
      for (let i = 0; i < rec.c.length; i++)
        if (rec.c[i] === 10)
          pts.push({ x: +rec.v[i] || 0, y: rec.numAfter(20, i) });
      return {
        ...e,
        type,
        pts,
        arrow: rec.int(71, 1) ? ctx.header.arrow : 0,
        spline: rec.int(72) === 1,
      };
    }
    case "MULTILEADER":
    case "MLEADER":
      return mleader(rec, e, ctx.header);
    case "MLINE":
      return mline(rec, e, ctx.mlineStyles);
    case "TOLERANCE": {
      const xi = rec.idx(11);
      const text = rec
        .str(1, "")
        .replace(/\{\\Fgdt;(.)\}/g, (_, g) => GDT[g] ?? g)
        .replace(/%%v/gi, " | ")
        .replace(/\^J/g, "\n");
      return {
        ...e,
        type: "TEXT",
        text,
        h: ctx.header.dimtxt,
        p: rec.pt(10),
        rot: xi >= 0 ? Math.atan2(rec.numAfter(21, xi), +rec.v[xi] || 1) : 0,
        att: 4,
        wf: 1,
      };
    }
    case "IMAGE":
    case "OLE2FRAME": {
      if (type === "OLE2FRAME")
        return {
          ...e,
          type: "FRAME",
          pts: [rec.pt(10), rec.pt(11)],
          note: type,
        };
      const o = rec.pt(10),
        u = rec.pt(11),
        v = rec.pt(12),
        s = rec.pt(13, { x: 1, y: 1 });
      const U = { x: u.x * s.x, y: u.y * s.x },
        V = { x: v.x * s.y, y: v.y * s.y };
      return {
        ...e,
        type: "FRAME",
        note: type,
        pts: [
          o,
          { x: o.x + U.x, y: o.y + U.y },
          { x: o.x + U.x + V.x, y: o.y + U.y + V.y },
          { x: o.x + V.x, y: o.y + V.y },
        ],
      };
    }
    case "VIEWPORT":
      return {
        ...e,
        type,
        c: rec.pt(10),
        width: rec.num(40),
        height: rec.num(41),
        id: rec.int(69),
        vc: rec.pt(12),
        vh: rec.num(45),
        twist: rec.num(51) * D2R,
        status: rec.int(90),
      };
  }
  return { ...e, type, unsupported: true };
}

const GDT = {
  a: "∠",
  b: "⊥",
  c: "⏥",
  d: "⌓",
  e: "○",
  f: "∥",
  g: "⌭",
  h: "↗",
  i: "⌯",
  j: "⊕",
  k: "⌒",
  l: "Ⓛ",
  m: "Ⓜ",
  n: "⌀",
  p: "Ⓟ",
  r: "◎",
  s: "Ⓢ",
  t: "⌰",
  u: "—",
};

// ---------------------------------------------------------------- sections

function readEntities(r, ctx, endName, sink) {
  let poly = null,
    insert = null;
  while (r.next()) {
    if (r.code !== 0) continue;
    const type = r.value.trim();
    if (type === endName || type === "ENDSEC" || type === "EOF") {
      r.back();
      return;
    }
    const rec = readRec(r, type);
    if (type === "VERTEX") {
      if (poly) poly.verts.push(rec);
      continue;
    }
    if (type === "SEQEND") {
      if (poly) finishPolyline(poly, ctx);
      poly = insert = null;
      continue;
    }
    if (type === "ATTRIB") {
      if (insert) {
        const a = entity(rec, ctx);
        if (a && !a.hidden) insert.attribs.push(a);
      }
      continue;
    }
    if (poly) {
      finishPolyline(poly, ctx);
      poly = null;
    }
    insert = null;
    if (SKIP_SILENT.has(type) && type !== "VIEWPORT") continue;
    const e = entity(rec, ctx);
    if (!e) continue;
    if (e.unsupported) {
      ctx.skipped[type] = (ctx.skipped[type] ?? 0) + 1;
      continue;
    }
    if (NOT_DRAWABLE[type]) ctx.skipped[type] = (ctx.skipped[type] ?? 0) + 1;
    if (e.type === "POLYLINE") poly = e;
    if (e.type === "INSERT" && !e.table) insert = e;
    sink.push(e);
    if (++ctx.count % 5000 === 0) ctx.progress(r.progress());
  }
}

function finishPolyline(e, ctx) {
  const flags = e.flags,
    verts = e.verts;
  delete e.verts;
  const vf = (v) => v.int(70);
  if (flags & 64) {
    // Polyface mesh: vertices, then face records with 1-based indices.
    const pts = [],
      faces = [];
    for (const v of verts) {
      if (vf(v) & 128 && !(vf(v) & 64))
        faces.push(
          [71, 72, 73, 74].map((c) => v.int(c)).filter((i) => i !== 0),
        );
      else pts.push(v.pt(10));
    }
    e.type = "MESH";
    e.edges = [];
    for (const f of faces)
      for (let k = 0; k < f.length; k++) {
        const a = f[k],
          b = f[(k + 1) % f.length];
        if (a > 0 && pts[a - 1] && pts[Math.abs(b) - 1])
          e.edges.push([pts[a - 1], pts[Math.abs(b) - 1]]);
      }
    return;
  }
  if (flags & 16) {
    const pts = verts.map((v) => v.pt(10)),
      m = e.m,
      n = e.n;
    e.type = "MESH";
    e.edges = [];
    for (let i = 0; i < m; i++)
      for (let j = 0; j < n; j++) {
        const p = pts[i * n + j];
        if (!p) continue;
        if (j + 1 < n || flags & 32)
          e.edges.push([p, pts[i * n + ((j + 1) % n)]]);
        if (i + 1 < m || flags & 1)
          e.edges.push([p, pts[((i + 1) % m) * n + j]]);
      }
    return;
  }
  const is3d = !!(flags & 8);
  const ocs = is3d ? null : e.ocs;
  const flip = mirrored(ocs);
  // Spline/curve-fit polylines carry the frame (flag 16) plus the fitted vertices (flag 8).
  const fitted = flags & 4 ? verts.filter((v) => !(vf(v) & 16)) : verts;
  e.pts = fitted.map((v) => ({
    ...mapPt(ocs, v.pt(10)),
    b: flip ? -v.num(42) : v.num(42),
  }));
  e.type = "LWPOLYLINE";
  e.closed = !!(flags & 1);
  e.w = 0;
}

function readTables(r, doc) {
  while (r.next()) {
    if (r.code === 0 && r.value === "ENDSEC") return;
    if (r.code !== 0 || r.value === "TABLE" || r.value === "ENDTAB") continue;
    const type = r.value;
    const rec = readRec(r, type);
    if (type === "LAYER") {
      const name = unescapeDxf(rec.str(2, ""));
      const ci = rec.int(62, 7);
      const tc = rec.idx(420) >= 0 ? rec.int(420) & 0xffffff : undefined;
      doc.layers[name] = {
        color: tc ?? aci(Math.abs(ci) || 7),
        ci: Math.abs(ci) || 7,
        off: ci < 0 || !!(rec.int(70) & 1),
        frozen: !!(rec.int(70) & 1),
        lt: (rec.str(6, "CONTINUOUS") || "CONTINUOUS").toUpperCase(),
        lw: rec.int(370, -3),
        tc: tc !== undefined,
      };
    } else if (type === "LTYPE") {
      const name = rec.str(2, "").toUpperCase();
      const dashes = rec.all(49).map(Number);
      doc.ltypes[name] =
        dashes.length >= 2 && dashes.some((d) => d < 0) ? dashes : null;
    } else if (type === "BLOCK_RECORD") {
      doc.blockRecords[rec.str(5, "").trim()] = unescapeDxf(rec.str(2, ""));
    }
  }
}

function readBlocks(r, ctx, doc) {
  while (r.next()) {
    if (r.code === 0 && r.value === "ENDSEC") return;
    if (r.code !== 0 || r.value !== "BLOCK") continue;
    const rec = readRec(r, "BLOCK");
    const name = unescapeDxf(rec.str(2, ""));
    const flags = rec.int(70);
    const block = {
      base: rec.pt(10),
      entities: [],
      xref: flags & 4 ? rec.str(1, "") || name : null,
    };
    readEntities(r, ctx, "ENDBLK", block.entities);
    if (r.next() && r.value === "ENDBLK") readRec(r, "ENDBLK");
    doc.blocks[name] = block;
  }
}

function readObjects(r, doc) {
  while (r.next()) {
    if (r.code === 0 && r.value === "ENDSEC") return;
    if (r.code !== 0) continue;
    const type = r.value;
    if (type !== "LAYOUT" && type !== "MLINESTYLE") continue;
    const rec = readRec(r, type);
    if (type === "LAYOUT") {
      doc.rawLayouts.push({
        name: unescapeDxf(layoutName(rec)),
        tab: rec.int(71),
        h330: rec.all(330).map((h) => h.trim()),
        limits:
          rec.idx(10) >= 0 && rec.idx(11) >= 0
            ? [rec.pt(10), rec.pt(11)]
            : null,
      });
    } else {
      const els = [];
      const ofs = rec.all(49),
        cis = rec.c.flatMap((c, i) => (c === 62 && i > rec.idx(71) ? [rec.v[i]] : [])),
        lts = rec.all(6);
      for (let k = 0; k < ofs.length; k++)
        els.push({
          ci: cis[k] !== undefined ? +cis[k] : undefined,
          lt: lts[k]?.toUpperCase(),
        });
      doc.mlineStyles[rec.str(5, "").trim()] = els;
      doc.mlineStyles[rec.str(2, "").toUpperCase()] = els;
    }
  }
}

// ---------------------------------------------------------------- colors

let ACI = null;
/** AutoCAD color index -> 0xRRGGBB (the standard 256 color table). */
export function aci(i) {
  if (!ACI) {
    ACI = new Array(256);
    const base = [
      0, 0xff0000, 0xffff00, 0x00ff00, 0x00ffff, 0x0000ff, 0xff00ff, 0xffffff,
      0x808080, 0xc0c0c0,
    ];
    base.forEach((c, k) => (ACI[k] = c));
    const V = [255, 165, 127, 76, 38];
    for (let k = 10; k < 250; k++) {
      const hue = Math.floor((k - 10) / 10) * 15,
        row = (k - 10) % 10;
      const v = V[row >> 1],
        lo = row & 1 ? Math.floor(v / 2) : 0;
      const ch = (n) => {
        const t = (n + hue / 60) % 6;
        const f = Math.max(0, Math.min(t, 4 - t, 1)); // 1 at the "off" channels
        return Math.round(v - (v - lo) * f);
      };
      ACI[k] = (ch(5) << 16) | (ch(3) << 8) | ch(1);
    }
    [0x333333, 0x505050, 0x696969, 0x828282, 0xbebebe, 0xffffff].forEach(
      (c, k) => (ACI[250 + k] = c),
    );
  }
  i = Math.abs(i | 0);
  return ACI[i] ?? 0xffffff;
}

// ---------------------------------------------------------------- main

const UNITS = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1, 14: 0.1 };

export function parseDxf(bytes, onProgress = () => {}) {
  if (
    bytes.length > 22 &&
    new TextDecoder("latin1").decode(bytes.subarray(0, 18)) ===
      "AutoCAD Binary DXF"
  )
    throw dxfError("binary", "Binary DXF");
  const peek = headerPeek(bytes);
  try {
    return parseWith(bytes, "utf-8", true, onProgress);
  } catch (e) {
    if (!(e instanceof TypeError)) throw e;
    // Not UTF-8: older drawings use the Windows code page in $DWGCODEPAGE.
    return parseWith(
      bytes,
      CODEPAGES[peek.codepage] ?? "windows-1256",
      false,
      onProgress,
    );
  }
}

function parseWith(bytes, encoding, fatal, onProgress) {
  const r = new Reader(bytes, encoding, fatal);
  const doc = {
    header: {},
    layers: {},
    ltypes: {},
    blockRecords: {},
    blocks: {},
    entities: [],
    rawLayouts: [],
    mlineStyles: {},
  };
  const ctx = {
    skipped: {},
    count: 0,
    progress: onProgress,
    header: {},
    mlineStyles: doc.mlineStyles,
  };
  while (r.next()) {
    if (r.code !== 0 || r.value !== "SECTION") continue;
    if (!r.next()) break;
    const name = r.value.trim();
    if (name === "HEADER") readHeader(r, doc.header);
    else if (name === "TABLES") readTables(r, doc);
    else if (name === "BLOCKS") {
      setupCtx(ctx, doc.header);
      readBlocks(r, ctx, doc);
    } else if (name === "ENTITIES") {
      setupCtx(ctx, doc.header);
      readEntities(r, ctx, "ENDSEC", doc.entities);
    } else if (name === "OBJECTS") readObjects(r, doc);
  }
  if (
    !doc.entities.length &&
    !Object.keys(doc.blocks).length &&
    !Object.keys(doc.layers).length
  )
    throw dxfError("empty", "No drawing data");
  return finish(doc, ctx);
}

function setupCtx(ctx, h) {
  const dimscale = +h.$DIMSCALE || 1;
  ctx.header = {
    arrow: (+h.$DIMASZ || 2.5) * dimscale,
    dimtxt: (+h.$DIMTXT || 2.5) * dimscale,
  };
}

function readHeader(r, h) {
  let name = null;
  while (r.next()) {
    if (r.code === 0) {
      if (r.value === "ENDSEC") return;
      continue;
    }
    if (r.code === 9) name = r.value.trim();
    else if (name) {
      if (!(name in h)) h[name] = r.value.trim();
      h[name + "." + r.code] = r.value.trim();
    }
  }
}

function finish(doc, ctx) {
  // Paper space: *Paper_Space (active layout) entities sit in ENTITIES with 67=1,
  // the other layouts' entities in their *Paper_SpaceN blocks.
  const model = [],
    paper = [];
  for (const e of doc.entities) (e.paper ? paper : model).push(e);
  const layouts = [];
  const byHandle = doc.blockRecords;
  const vpOf = (list) =>
    list
      .filter(
        (a) => a.type === "VIEWPORT" && a.id !== 1 && a.vh > 0 && a.height > 0,
      )
      .map((a) => ({
        c: a.c,
        w: a.width,
        h: a.height,
        vc: a.vc,
        vh: a.vh,
        twist: a.twist || 0,
      }));
  const layoutOf = (name, list, limits) => {
    const ents = list.filter((a) => a.type !== "VIEWPORT");
    const viewports = vpOf(list);
    return ents.length || viewports.length
      ? { name, entities: ents, viewports, limits }
      : null;
  };
  const sorted = doc.rawLayouts
    .filter((l) => l.name && !/^model$/i.test(l.name))
    .sort((a, b) => a.tab - b.tab);
  for (const l of sorted) {
    const block = l.h330
      .map((h) => byHandle[h])
      .find((n) => n && /^\*paper_space/i.test(n));
    if (!block) continue;
    const list = /^\*paper_space$/i.test(block)
      ? paper
      : (doc.blocks[block]?.entities ?? []);
    const lay = layoutOf(
      l.name,
      list,
      l.limits && l.limits[1].x > l.limits[0].x ? l.limits : null,
    );
    if (lay) layouts.push(lay);
  }
  if (!sorted.length && paper.length) {
    const lay = layoutOf("Layout", paper, null);
    if (lay) layouts.push(lay);
  }
  const blocks = {};
  const xrefs = [];
  for (const [name, b] of Object.entries(doc.blocks)) {
    if (/^\*(model|paper)_space/i.test(name)) continue;
    blocks[name] = {
      base: b.base,
      entities: b.entities.filter((e) => e.type !== "VIEWPORT"),
    };
    if (b.xref) xrefs.push(b.xref);
  }
  // LibreDWG's DXF writer marks every indexed-color layer as off (negative 62)
  // for many DWG versions. A drawing with all layers off makes no sense, so then
  // the flag is ignored.
  const aciLayers = Object.values(doc.layers).filter((l) => !l.tc);
  if (aciLayers.length > 1 && aciLayers.every((l) => l.off && !l.frozen))
    for (const l of Object.values(doc.layers)) if (!l.frozen) l.off = false;
  if (!doc.layers["0"])
    doc.layers["0"] = {
      color: 0xffffff,
      ci: 7,
      off: false,
      lt: "CONTINUOUS",
      lw: -3,
    };
  const h = doc.header;
  const ins = parseInt(h.$INSUNITS);
  const notes = [];
  if (xrefs.length) notes.push({ kind: "xref", items: [...new Set(xrefs)] });
  const ex = [
    h["$EXTMIN.10"],
    h["$EXTMIN.20"],
    h["$EXTMAX.10"],
    h["$EXTMAX.20"],
  ].map(Number);
  const extents =
    ex.every((v) => Number.isFinite(v) && Math.abs(v) < 1e12) &&
    ex[2] > ex[0] &&
    ex[3] > ex[1]
      ? { minX: ex[0], minY: ex[1], maxX: ex[2], maxY: ex[3] }
      : null;
  return {
    version: h.$ACADVER ?? "",
    extents,
    units: UNITS[ins] ? ins : 0,
    ltscale: +h.$LTSCALE || 1,
    layers: doc.layers,
    ltypes: doc.ltypes,
    blocks,
    entities: model.filter((e) => e.type !== "VIEWPORT"),
    layouts,
    skipped: ctx.skipped,
    notes,
  };
}
