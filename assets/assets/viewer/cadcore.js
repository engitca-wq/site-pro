// Drawing core for the Site Pro viewer:
//   aci(i)                 AutoCAD color index -> 0xRRGGBB
//   parse(bytes, kind, cb) DWG/DXF -> drawing model (in a worker when possible)
//   flatten(doc, list)     drawing model -> per-layer polylines/fills/texts in world units
import { aci, bspline } from "./dxf.js";

export { aci };

// ---------------------------------------------------------------- parse

const MESSAGES = {
  version: (m) =>
    `نسخة ملف الـ DWG دي (${m}) مش مدعومة. احفظ الملف من الأوتوكاد بصيغة 2018 أو 2013 أو DXF وارفعه تاني.`,
  notdwg: () =>
    "الملف ده مش ملف DWG سليم. ممكن يكون اتقطع وهو بيترفع أو يكون امتداده غلط.",
  binary: () =>
    "ملف الـ DXF ده محفوظ بصيغة Binary. احفظه من الأوتوكاد كـ DXF عادي (ASCII) وارفعه تاني.",
  empty: () => "الملف اتقرا بس مفيهوش رسم.",
  crash: () =>
    "مكتبة قراءة الـ DWG وقعت وهي بتقرا الملف ده. جرّب تحفظه من الأوتوكاد بصيغة DXF أو 2013 وترفعه تاني.",
  read: () =>
    "مقدرناش نقرا الملف ده. جرّب تحفظه من الأوتوكاد بصيغة DXF وترفعه تاني.",
};

function readError(code, message) {
  const e = new Error(message);
  e.code = code;
  e.userMessage = (MESSAGES[code] ?? MESSAGES.read)(message);
  return e;
}

export async function parse(bytes, kind, onProgress = () => {}) {
  let doc;
  try {
    doc = await viaWorker(bytes, kind, onProgress);
  } catch (e) {
    if (e.code !== "noworker")
      throw e.userMessage
        ? e
        : readError(e.code ?? "read", String(e.message ?? e));
    const { readDrawing } = await import("./cadread.js");
    try {
      doc = await readDrawing(bytes, kind, onProgress);
    } catch (e2) {
      throw readError(e2.code ?? "read", String(e2.message ?? e2));
    }
  }
  doc.summary = summary(doc);
  return doc;
}

function viaWorker(bytes, kind, onProgress) {
  return new Promise((resolve, reject) => {
    let w;
    try {
      w = new Worker(new URL("./cadworker.js", import.meta.url), {
        type: "module",
      });
    } catch {
      return reject(Object.assign(new Error("worker"), { code: "noworker" }));
    }
    let started = false;
    const noWorker = () => {
      w.terminate();
      reject(Object.assign(new Error("worker"), { code: "noworker" }));
    };
    const timer = setTimeout(() => !started && noWorker(), 8000);
    w.onerror = (ev) => {
      ev.preventDefault?.();
      clearTimeout(timer);
      if (!started) return noWorker();
      w.terminate();
      // The worker died mid-read (usually out of memory on a huge file).
      reject(readError("crash", String(ev.message ?? "worker error")));
    };
    w.onmessage = ({ data }) => {
      if (data.type === "ready") {
        started = true;
        clearTimeout(timer);
        // The bytes are handed over, not copied: the caller doesn't use them again.
        const buf =
          bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
            ? bytes.buffer
            : bytes.slice().buffer;
        w.postMessage({ bytes: buf, kind }, [buf]);
      } else if (data.type === "progress") onProgress(data.stage, data.f);
      else if (data.type === "done") {
        w.terminate();
        resolve(data.doc);
      } else if (data.type === "error") {
        w.terminate();
        reject(readError(data.code, data.message));
      }
    };
  });
}

const SKIP_NAMES = {
  "3DSOLID": "مجسمات 3D",
  REGION: "مناطق Region",
  BODY: "أجسام 3D",
  SURFACE: "أسطح 3D",
  MESH: "شبكات Mesh",
  ACAD_PROXY_ENTITY: "عناصر Proxy",
  SHAPE: "رموز Shape",
  ARCALIGNEDTEXT: "نص على قوس",
  IMAGE: "صور مرفقة (ظاهر إطارها بس)",
  OLE2FRAME: "عناصر OLE (ظاهر إطارها بس)",
  OLEFRAME: "عناصر OLE",
};

/** One Arabic line about what could not be shown, or ''. */
function summary(doc) {
  const parts = [];
  for (const [type, n] of Object.entries(doc.skipped ?? {}))
    parts.push(`${SKIP_NAMES[type] ?? type} (${n})`);
  const xref = doc.notes?.find((n) => n.kind === "xref");
  let s = parts.length ? "عناصر مش ظاهرة في العرض: " + parts.join("، ") : "";
  if (xref)
    s +=
      (s ? " — " : "") +
      "ملفات مرجعية (Xref) مش موجودة: " +
      xref.items
        .slice(0, 5)
        .map((x) => x.split(/[\\/]/).pop())
        .join("، ");
  return s;
}

// ---------------------------------------------------------------- geometry helpers

// Chord tolerance for curves, in world units; set per drawing by flatten().
let TOL = 0;

/** Segments for a sweep of `sweep` radians at radius r (finer for big curves). */
function arcSteps(r, sweep) {
  const full = !(TOL > 0) ? 72 : r > TOL ? Math.PI / Math.acos(1 - TOL / r) : 0;
  return Math.max(
    3,
    Math.ceil(Math.min(Math.max(full, 16), 128) * (sweep / (Math.PI * 2))),
  );
}

function arcPoints(c, r, a0, a1) {
  while (a1 <= a0) a1 += Math.PI * 2;
  const n = arcSteps(r, a1 - a0);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  }
  return out;
}

function bulgePoints(p, q, b) {
  if (!b) return [q];
  const ang = 4 * Math.atan(b),
    dx = q.x - p.x,
    dy = q.y - p.y,
    d = Math.hypot(dx, dy);
  if (!d) return [q];
  const r = d / (2 * Math.sin(ang / 2)),
    mx = (p.x + q.x) / 2,
    my = (p.y + q.y) / 2,
    h = r * Math.cos(ang / 2),
    cx = mx - (h * dy) / d,
    cy = my + (h * dx) / d,
    s = Math.atan2(p.y - cy, p.x - cx),
    n = arcSteps(Math.abs(r), Math.abs(ang)),
    out = [];
  for (let i = 1; i <= n; i++) {
    const a = s + (ang * i) / n;
    out.push({
      x: cx + Math.abs(r) * Math.cos(a),
      y: cy + Math.abs(r) * Math.sin(a),
    });
  }
  out[out.length - 1] = q;
  return out;
}

function polyPoints(pts, closed) {
  if (!pts.length) return [];
  const out = [{ x: pts[0].x, y: pts[0].y }],
    n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++)
    out.push(...bulgePoints(pts[i], pts[(i + 1) % pts.length], pts[i].b));
  return out;
}

function catmull(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i],
      p1 = pts[i],
      p2 = pts[i + 1],
      p3 = pts[i + 2] ?? p2;
    for (let k = 1; k <= 10; k++) {
      const t = k / 10,
        t2 = t * t,
        t3 = t2 * t;
      const f = (a, b, c, d) =>
        0.5 *
        (2 * b +
          (-a + c) * t +
          (2 * a - 5 * b + 4 * c - d) * t2 +
          (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  return out;
}

/** Splits a polyline into the dashes of a linetype (lengths in world units). */
function dashes(pts, pat, s) {
  let total = 0;
  for (const d of pat) total += Math.abs(d);
  total *= s;
  if (!(total > 0) || pts.length < 2) return [pts];
  let len = 0;
  for (let i = 1; i < pts.length; i++)
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  // Too fine to see (or too many pieces): draw it solid, like AutoCAD does.
  if (len / total > 300) return [pts];
  const out = [],
    dot = total * 0.01;
  let k = 0,
    rem = Math.abs(pat[0]) * s,
    cur = pat[0] > 0 ? [pts[0]] : null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1],
      b = pts[i],
      d = Math.hypot(b.x - a.x, b.y - a.y);
    if (!d) continue;
    const ux = (b.x - a.x) / d,
      uy = (b.y - a.y) / d;
    let t = 0;
    while (d - t > rem) {
      t += rem;
      const p = { x: a.x + ux * t, y: a.y + uy * t };
      if (pat[k] === 0) out.push([p, { x: p.x + ux * dot, y: p.y + uy * dot }]);
      else if (cur) {
        cur.push(p);
        out.push(cur);
      }
      cur = null;
      k = (k + 1) % pat.length;
      rem = Math.abs(pat[k]) * s;
      if (pat[k] > 0) cur = [p];
    }
    rem -= d - t;
    if (cur) cur.push(b);
  }
  if (cur && cur.length > 1) out.push(cur);
  return out;
}

/** Pattern hatch lines clipped to the loops (even-odd). null = too dense. */
function hatchSegments(loops, patterns, cap) {
  const out = [];
  for (const pl of patterns) {
    const ca = Math.cos(pl.a),
      sa = Math.sin(pl.a);
    const spacing = -pl.ox * sa + pl.oy * ca;
    if (Math.abs(spacing) < 1e-9) continue;
    const bn = -pl.bx * sa + pl.by * ca;
    let dmin = Infinity,
      dmax = -Infinity;
    for (const l of loops)
      for (const p of l) {
        const d = -p.x * sa + p.y * ca;
        if (d < dmin) dmin = d;
        if (d > dmax) dmax = d;
      }
    let k0 = Math.ceil((dmin - bn) / spacing),
      k1 = Math.floor((dmax - bn) / spacing);
    if (k0 > k1) [k0, k1] = [k1, k0];
    if (k1 - k0 > cap) return null;
    const total = pl.dashes.reduce((a, b) => a + Math.abs(b), 0);
    for (let k = k0; k <= k1; k++) {
      const ox = pl.bx + k * pl.ox,
        oy = pl.by + k * pl.oy;
      const ts = [];
      for (const l of loops)
        for (let i = 0; i < l.length; i++) {
          const p = l[i],
            q = l[(i + 1) % l.length];
          const sp = -(p.x - ox) * sa + (p.y - oy) * ca,
            sq = -(q.x - ox) * sa + (q.y - oy) * ca;
          if (sp < 0 === sq < 0) continue;
          const tp = (p.x - ox) * ca + (p.y - oy) * sa,
            tq = (q.x - ox) * ca + (q.y - oy) * sa;
          ts.push(tp + ((tq - tp) * sp) / (sp - sq));
        }
      ts.sort((a, b) => a - b);
      const at = (t) => ({ x: ox + ca * t, y: oy + sa * t });
      for (let i = 0; i + 1 < ts.length; i += 2) {
        const t0 = ts[i],
          t1 = ts[i + 1];
        if (!(total > 0)) {
          out.push([at(t0), at(t1)]);
        } else {
          let t = Math.floor(t0 / total) * total,
            j = 0;
          while (t < t1) {
            const dl = pl.dashes[j],
              e = t + Math.abs(dl);
            if (dl >= 0) {
              const a = Math.max(t, t0),
                b = Math.min(dl === 0 ? t + total * 0.01 : e, t1);
              if (b > a) out.push([at(a), at(b)]);
            }
            t = e;
            j = (j + 1) % pl.dashes.length;
            if (out.length > cap * 5) return null;
          }
        }
      }
      if (out.length > cap * 5) return null;
    }
  }
  return out;
}

// ---------------------------------------------------------------- text

const PCT = { c: "Ø", d: "°", p: "±" };

export function plainText(t) {
  if (t && typeof t === "object") t = t.text ?? t.value ?? "";
  return String(t ?? "")
    .replace(/\\\\/g, "\u0001")
    .replace(/\\[{}]/g, (m) => (m[1] === "{" ? "\u0002" : "\u0003"))
    .replace(/\\P/g, "\n")
    .replace(/\\[NX]/g, "\n")
    .replace(/\\[ACcFfHhQqTtWwp][^;]*;/g, "")
    .replace(/\\[LlOoKk]/g, "")
    .replace(/\\S([^;]*);/g, (_, s) => s.replace(/[#^/]/, "/"))
    .replace(/\\~/g, " ")
    .replace(/[{}]/g, "")
    .replace(/%%(\d{3})/g, (_, n) => String.fromCharCode(+n))
    .replace(/%%([cdpCDP])/g, (_, c) => PCT[c.toLowerCase()])
    .replace(/%%[uUoOkK]/g, "")
    .replace(/%%%/g, "%")
    .replace(/\u0001/g, "\\")
    .replace(/\u0002/g, "{")
    .replace(/\u0003/g, "}");
}

// ---------------------------------------------------------------- flatten

const BIG = 1e9;

export function flatten(doc, list = doc.entities) {
  const layers = {},
    names = [],
    index = new Map(),
    snaps = [],
    circles = [],
    inserts = [],
    texts = [],
    infinite = [],
    xs = [],
    ys = [];
  const bbox = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  const LT = doc.ltypes ?? {},
    ltscale = doc.ltscale || 1;
  const ents_ = [];
  let box = null,
    insIdx = -1,
    segs = new Float64Array(1 << 16),
    eids = new Int32Array(1 << 13),
    nseg = 0,
    curEnt = -1,
    tick = 0;
  const seg = (a, b, li) => {
    if (nseg + 6 > segs.length) {
      const g = new Float64Array(segs.length * 2);
      g.set(segs);
      segs = g;
    }
    if (nseg / 6 >= eids.length) {
      const h = new Int32Array(eids.length * 2);
      h.set(eids);
      eids = h;
    }
    eids[nseg / 6] = curEnt;
    segs[nseg++] = a.x;
    segs[nseg++] = a.y;
    segs[nseg++] = b.x;
    segs[nseg++] = b.y;
    segs[nseg++] = li;
    segs[nseg++] = insIdx;
  };
  // Curves are cut into chords no more than ~1/50000 of the drawing off the true curve.
  const ext = roughExtents(list);
  TOL = ext ? Math.max(ext.maxX - ext.minX, ext.maxY - ext.minY) / 50000 : 0;

  const layerOf = (name) => {
    let L = layers[name];
    if (!L) {
      const def = doc.layers[name];
      L = layers[name] = {
        color: def?.color ?? 0xffffff,
        off: !!def?.off,
        lines: [],
        fills: [],
        texts: [],
      };
      index.set(name, names.length);
      names.push(name);
    }
    return L;
  };

  const walk = (ents, M, pLayer, pColor, pLt, pLw, depth) => {
    const k = Math.hypot(M[0], M[1]);
    const N = (p) => {
      const q = {
        x: M[0] * p.x + M[2] * p.y + M[4],
        y: M[1] * p.x + M[3] * p.y + M[5],
      };
      grow(q);
      return q;
    };
    // Same transform without growing the extents (centers, insertion points).
    const T = (p) => ({
      x: M[0] * p.x + M[2] * p.y + M[4],
      y: M[1] * p.x + M[3] * p.y + M[5],
    });
    const grow = (q) => {
      if (
        Number.isFinite(q.x) &&
        Number.isFinite(q.y) &&
        Math.abs(q.x) < BIG &&
        Math.abs(q.y) < BIG
      ) {
        if (q.x < bbox.minX) bbox.minX = q.x;
        if (q.y < bbox.minY) bbox.minY = q.y;
        if (q.x > bbox.maxX) bbox.maxX = q.x;
        if (q.y > bbox.maxY) bbox.maxY = q.y;
        if (box) {
          if (q.x < box.minX) box.minX = q.x;
          if (q.y < box.minY) box.minY = q.y;
          if (q.x > box.maxX) box.maxX = q.x;
          if (q.y > box.maxY) box.maxY = q.y;
        }
        if ((++tick & 7) === 0) {
          xs.push(q.x);
          ys.push(q.y);
        }
      }
    };
    // Transforms freshly made points in place (no new objects).
    const NI = (pts) => {
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i],
          x = p.x;
        p.x = M[0] * x + M[2] * p.y + M[4];
        p.y = M[1] * x + M[3] * p.y + M[5];
        grow(p);
      }
      return pts;
    };
    let n, lname, L, li, C, ltName, lw, lwOut, pat, dashScale;
    const line = (pts, closed, color = C, fresh = false) => {
      if (pts.length < 2) return;
      const w = fresh ? NI(pts) : pts.map(N);
      if (closed) w.push(w[0]);
      for (const piece of pat ? dashes(w, pat, dashScale) : [w])
        L.lines.push({ color, lw: lwOut, pts: piece });
      for (let i = 1; i < w.length; i++) seg(w[i - 1], w[i], li);
    };
    {
      const snap = (...ps) => {
        for (const p of ps) snaps.push({ ...N(p), l: li });
      };
      const snapT = (p) => snaps.push({ ...T(p), l: li });
      const fill = (loops, alpha) =>
        L.fills.push({ color: C, alpha, loops: loops.map((l) => l.map(N)) });
      const arrow = (tip, from, size) => {
        const d = Math.hypot(from.x - tip.x, from.y - tip.y);
        if (!d || !size) return;
        const ux = (from.x - tip.x) / d,
          uy = (from.y - tip.y) / d,
          w = size / 6;
        const b = { x: tip.x + ux * size, y: tip.y + uy * size };
        fill(
          [
            [
              tip,
              { x: b.x - uy * w, y: b.y + ux * w },
              { x: b.x + uy * w, y: b.y - ux * w },
            ],
          ],
          1,
        );
      };
      const text = (str, p, h, rot, att, extra = {}) => {
        const s = plainText(str);
        if (!s.trim()) return;
        const c = Math.cos(rot),
          sn = Math.sin(rot);
        const t = {
          color: C,
          p: N(p),
          h: h * k,
          rot: Math.atan2(M[1] * c + M[3] * sn, M[0] * c + M[2] * sn),
          str: s,
          att,
          layer: lname,
          ...extra,
        };
        L.texts.push(t);
        texts.push(t);
        snap(p);
      };
      for (n of ents) {
        lname = n.layer === "0" && pLayer ? pLayer : n.layer;
        L = layerOf(lname);
        li = index.get(lname);
        const def = doc.layers[lname];
        if (def?.frozen) continue;
        C =
          n.ci === 0
            ? (pColor ?? L.color)
            : n.ci === 257
              ? n.rgb
              : n.ci === 256 || n.ci === undefined
                ? L.color
                : aci(n.ci);
        // Top-level entity number, so a tap can select the whole object.
        if (depth === 0) {
          curEnt = ents_.length;
          ents_.push({ type: n.type, layer: lname, color: C, name: n.name });
        }
        ltName =
          n.lt === "BYBLOCK"
            ? (pLt ?? "CONTINUOUS")
            : !n.lt || n.lt === "BYLAYER"
              ? (def?.lt ?? "CONTINUOUS")
              : n.lt;
        lw =
          n.lw === -2
            ? (pLw ?? -3)
            : n.lw === -1 || n.lw === undefined
              ? (def?.lw ?? -3)
              : n.lw;
        lwOut = lw < 0 ? 0 : lw;
        pat = LT[ltName];
        dashScale = ltscale * (n.lts || 1) * k;
        switch (n.type) {
          case "LINE":
            line(n.pts);
            snap(n.pts[0], n.pts[1], {
              x: (n.pts[0].x + n.pts[1].x) / 2,
              y: (n.pts[0].y + n.pts[1].y) / 2,
            });
            break;
          case "LWPOLYLINE": {
            line(polyPoints(n.pts, n.closed));
            snap(...n.pts);
            for (let i = 1; i < n.pts.length; i++)
              snap({
                x: (n.pts[i].x + n.pts[i - 1].x) / 2,
                y: (n.pts[i].y + n.pts[i - 1].y) / 2,
              });
            break;
          }
          case "CIRCLE":
            line(arcPoints(n.c, n.r, 0, Math.PI * 2), false, C, true);
            snapT(n.c);
            snap(
              { x: n.c.x + n.r, y: n.c.y },
              { x: n.c.x - n.r, y: n.c.y },
              { x: n.c.x, y: n.c.y + n.r },
              { x: n.c.x, y: n.c.y - n.r },
            );
            circles.push({ c: T(n.c), r: n.r * k, layer: li });
            break;
          case "ARC": {
            const pts = arcPoints(n.c, n.r, n.a0, n.a1);
            snapT(n.c);
            snap(pts[0], pts[pts.length - 1], pts[pts.length >> 1]);
            line(pts, false, C, true);
            circles.push({ c: T(n.c), r: n.r * k, layer: li, arc: true });
            break;
          }
          case "ELLIPSE": {
            const R = Math.hypot(n.major.x, n.major.y),
              rot = Math.atan2(n.major.y, n.major.x),
              r2 = R * n.ratio;
            let a0 = n.a0 ?? 0,
              a1 = n.a1 ?? Math.PI * 2;
            while (a1 <= a0) a1 += Math.PI * 2;
            const pts = [],
              steps = arcSteps(R, a1 - a0);
            for (let i = 0; i <= steps; i++) {
              const a = a0 + ((a1 - a0) * i) / steps,
                x = R * Math.cos(a),
                y = r2 * Math.sin(a);
              pts.push({
                x: n.c.x + x * Math.cos(rot) - y * Math.sin(rot),
                y: n.c.y + x * Math.sin(rot) + y * Math.cos(rot),
              });
            }
            line(pts, false, C, true);
            snap(n.c);
            break;
          }
          case "SPLINE": {
            const pts =
              n.ctrl.length >= 2
                ? bspline(n.degree || 3, n.ctrl, n.knots)
                : catmull(n.fit);
            line(
              pts,
              n.closed &&
                pts.length > 2 &&
                Math.hypot(
                  pts[0].x - pts[pts.length - 1].x,
                  pts[0].y - pts[pts.length - 1].y,
                ) > 1e-9,
            );
            break;
          }
          case "FACE":
            line(n.pts, true);
            snap(...n.pts);
            break;
          case "MESH":
            for (const [a, b] of n.edges) line([a, b]);
            break;
          case "FRAME":
            if (n.pts.length === 2) {
              const [a, b] = n.pts;
              line([a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }], true);
            } else line(n.pts, true);
            break;
          case "SOLID":
            if (n.pts.length >= 3) fill([n.pts], 1);
            break;
          case "HATCH": {
            const loops = n.loops
              .filter((l) => l.length >= 2)
              .map((l) => polyPoints(l, true));
            if (!loops.length) break;
            if (n.solid) {
              fill(loops, 1);
              break;
            }
            const segsH = hatchSegments(loops, n.patterns, 4000);
            if (!segsH) {
              fill(loops, 0.25);
              break;
            }
            for (const [a, b] of segsH)
              L.lines.push({ color: C, lw: lwOut, pts: [N(a), N(b)] });
            break;
          }
          case "TEXT":
            text(n.text, n.p, n.h, n.rot, n.att, { wf: n.wf || 1 });
            break;
          case "MTEXT":
            text(n.text, n.p, n.h, n.rot, n.att || 1, {
              w: (n.w || 0) * k,
              ls: n.ls || 1,
            });
            break;
          case "POINT":
            snap(n.p);
            break;
          case "XLINE":
          case "RAY":
            infinite.push({
              L,
              color: C,
              lw: lwOut,
              p: N(n.p),
              d: {
                x: M[0] * n.dir.x + M[2] * n.dir.y,
                y: M[1] * n.dir.x + M[3] * n.dir.y,
              },
              ray: n.type === "RAY",
            });
            break;
          case "LEADER":
            if (n.pts.length >= 2) {
              line(n.spline ? catmull(n.pts) : n.pts);
              arrow(n.pts[0], n.pts[1], n.arrow);
              snap(...n.pts);
            }
            break;
          case "MLEADER":
            for (const ld of n.leaders) {
              for (const ln of ld.lines) {
                const pts = ld.last ? [...ln, ld.last] : ln;
                if (pts.length >= 2) {
                  line(pts);
                  arrow(pts[0], pts[1], n.arrow);
                }
              }
              if (ld.last && ld.dog && ld.dogLen)
                line([
                  ld.last,
                  {
                    x: ld.last.x + ld.dog.x * ld.dogLen,
                    y: ld.last.y + ld.dog.y * ld.dogLen,
                  },
                ]);
            }
            if (n.tp && n.text)
              text(n.text, n.tp, n.th, n.tdir, n.att || 1, {
                w: (n.tw || 0) * k,
              });
            break;
          case "MLINE":
            for (const el of n.lines) {
              const color =
                el.ci === undefined || el.ci === 256
                  ? C
                  : el.ci === 0
                    ? C
                    : aci(el.ci);
              line(el.pts, n.closed, color);
            }
            break;
          case "INSERT":
          case "DIMENSION": {
            const blk = doc.blocks[n.name];
            if (!blk) {
              if (n.type === "DIMENSION" && n.tp) {
                const v =
                  n.label && n.label !== "<>"
                    ? n.label
                    : Number.isFinite(n.measure)
                      ? String(Math.round(n.measure * 100) / 100)
                      : "";
                if (v) text(v, n.tp, doc.dimtxt ?? 2.5, 0, 5);
              }
              break;
            }
            if (depth > 12) break;
            const top =
              depth === 0 && n.type === "INSERT" && !/^\*/.test(n.name);
            if (top) {
              box = {
                minX: Infinity,
                minY: Infinity,
                maxX: -Infinity,
                maxY: -Infinity,
              };
              insIdx = inserts.length;
              const o = n.ocs ?? [1, 0, 0, 1];
              inserts.push({ name: n.name, layer: lname, box, p: T({ x: o[0] * n.p.x + o[2] * n.p.y, y: o[1] * n.p.x + o[3] * n.p.y }) });
            }
            if (n.type === "DIMENSION")
              walk(blk.entities, M, lname, C, ltName, lw, depth + 1);
            else {
              const o = n.ocs ?? [1, 0, 0, 1];
              for (let r = 0; r < n.rows; r++)
                for (let c = 0; c < n.cols; c++) {
                  const cs = Math.cos(n.rot),
                    sn = Math.sin(n.rot);
                  const px = n.p.x + cs * c * n.dc - sn * r * n.dr,
                    py = n.p.y + sn * c * n.dc + cs * r * n.dr;
                  // OCS (2x2) * [rotation*scale | insertion - base]
                  const B = [cs * n.sx, sn * n.sx, -sn * n.sy, cs * n.sy, 0, 0];
                  B[4] = px - (B[0] * blk.base.x + B[2] * blk.base.y);
                  B[5] = py - (B[1] * blk.base.x + B[3] * blk.base.y);
                  const O = [
                    o[0] * B[0] + o[2] * B[1],
                    o[1] * B[0] + o[3] * B[1],
                    o[0] * B[2] + o[2] * B[3],
                    o[1] * B[2] + o[3] * B[3],
                    o[0] * B[4] + o[2] * B[5],
                    o[1] * B[4] + o[3] * B[5],
                  ];
                  const F = [
                    M[0] * O[0] + M[2] * O[1],
                    M[1] * O[0] + M[3] * O[1],
                    M[0] * O[2] + M[2] * O[3],
                    M[1] * O[2] + M[3] * O[3],
                    M[0] * O[4] + M[2] * O[5] + M[4],
                    M[1] * O[4] + M[3] * O[5] + M[5],
                  ];
                  walk(blk.entities, F, lname, C, ltName, lw, depth + 1);
                }
              {
                const o = n.ocs ?? [1, 0, 0, 1];
                snapT({ x: o[0] * n.p.x + o[2] * n.p.y, y: o[1] * n.p.x + o[3] * n.p.y });
              }
              if (n.attribs?.length)
                walk(n.attribs, M, lname, C, ltName, lw, depth + 1);
            }
            if (top) {
              box = null;
              insIdx = -1;
            }
            break;
          }
        }
      }
    }
  };
  walk(list, [1, 0, 0, 1, 0, 0], null, null, null, null, 0);
  if (!Number.isFinite(bbox.minX))
    Object.assign(bbox, { minX: 0, minY: 0, maxX: 100, maxY: 100 });
  // Construction lines run to well past the drawing, without growing its extents.
  if (infinite.length) {
    const cx = (bbox.minX + bbox.maxX) / 2,
      cy = (bbox.minY + bbox.maxY) / 2,
      size = Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY, 1);
    for (const f of infinite) {
      const len = Math.hypot(f.d.x, f.d.y) || 1,
        ux = f.d.x / len,
        uy = f.d.y / len,
        reach = Math.hypot(f.p.x - cx, f.p.y - cy) + size * 3;
      const a = f.ray ? f.p : { x: f.p.x - ux * reach, y: f.p.y - uy * reach };
      f.L.lines.push({
        color: f.color,
        lw: f.lw,
        pts: [a, { x: f.p.x + ux * reach, y: f.p.y + uy * reach }],
      });
    }
  }
  return {
    layers,
    layerNames: names,
    bbox,
    view: viewBox(xs, ys, bbox),
    snaps,
    circles,
    inserts,
    texts,
    segs: segs.subarray(0, nseg),
    eids: eids.subarray(0, nseg / 6),
    ents: ents_,
  };
}

/** Size of the drawing from entity anchor points, ignoring the 1% farthest out. */
function roughExtents(list) {
  const xs = [],
    ys = [];
  for (const e of list) {
    const p = e.pts?.[0] ?? e.c ?? e.p;
    if (
      !p ||
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      Math.abs(p.x) > BIG ||
      Math.abs(p.y) > BIG
    )
      continue;
    xs.push(p.x);
    ys.push(p.y);
  }
  if (xs.length < 2) return null;
  const X = Float64Array.from(xs).sort(),
    Y = Float64Array.from(ys).sort();
  const q = (a, f) => a[Math.min(a.length - 1, Math.floor(a.length * f))];
  const b = {
    minX: q(X, 0.01),
    maxX: q(X, 0.99),
    minY: q(Y, 0.01),
    maxY: q(Y, 0.99),
  };
  return b.maxX > b.minX || b.maxY > b.minY ? b : null;
}

/** Zoom-extents box that ignores a few far-away stray objects. */
function viewBox(xs, ys, b) {
  if (xs.length < 50) return b;
  const q = (a, f) =>
    a[Math.min(a.length - 1, Math.max(0, Math.floor(a.length * f)))];
  const X = Float64Array.from(xs).sort(),
    Y = Float64Array.from(ys).sort();
  const v = {
    minX: q(X, 0.005),
    maxX: q(X, 0.995),
    minY: q(Y, 0.005),
    maxY: q(Y, 0.995),
  };
  const w = b.maxX - b.minX,
    h = b.maxY - b.minY,
    vw = v.maxX - v.minX || 1,
    vh = v.maxY - v.minY || 1;
  if (w < vw * 4 && h < vh * 4) return b;
  const m = Math.max(vw, vh) * 0.05;
  return {
    minX: v.minX - m,
    maxX: v.maxX + m,
    minY: v.minY - m,
    maxY: v.maxY + m,
  };
}

// The bundled viewer imports these by their short names.
export { aci as a, parse as b, flatten as c };
