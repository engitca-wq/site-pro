import { c as L } from "./cadcore.js";
var E = (i) => "#" + ((i ?? 16726832) & 16777215).toString(16).padStart(6, "0"),
  D = 'Tajawal, "Segoe UI", Tahoma, sans-serif',
  A = {
    dist: 2,
    idpt: 1,
    arclen: 3,
    dim_aligned: 3,
    dim_linear: 3,
    dim_angular: 3,
    dim_radius: 2,
    dim_diameter: 2,
    arrow: 2,
    text: 1,
    image: 1,
    audio: 1,
    pin: 1,
    line: 2,
    circle: 2,
    arc: 3,
    rect: 2,
    ellipse: 3,
    cont: 0,
    area: 0,
    count: 0,
    polyline: 0,
  };
function Z(i, s, t) {
  let e = 2 * (i.x * (s.y - t.y) + s.x * (t.y - i.y) + t.x * (i.y - s.y));
  if (Math.abs(e) < 1e-12) return null;
  let n = i.x * i.x + i.y * i.y,
    o = s.x * s.x + s.y * s.y,
    h = t.x * t.x + t.y * t.y,
    a = (n * (s.y - t.y) + o * (t.y - i.y) + h * (i.y - s.y)) / e,
    l = (n * (t.x - s.x) + o * (i.x - t.x) + h * (s.x - i.x)) / e;
  return { x: a, y: l, r: Math.hypot(i.x - a, i.y - l) };
}
function J(i, s, t) {
  let e = Z(i, s, t);
  if (!e) return null;
  let n = (c) => Math.atan2(c.y - e.y, c.x - e.x),
    o = n(i),
    h = n(s),
    a = n(t),
    l = (c) => ((c % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI),
    d = l(a - o);
  return l(h - o) > d && (d -= 2 * Math.PI), { ...e, a0: o, sweep: d };
}
var C = (i) => ({ x: i[0], y: i[1] }),
  Y = (i, s) => Math.hypot(i.x - s.x, i.y - s.y);
function W(i, s) {
  let t = s.map(C);
  switch (i) {
    case "dist":
    case "cont": {
      let e = 0;
      for (let n = 1; n < t.length; n++) e += Y(t[n], t[n - 1]);
      return e;
    }
    case "area": {
      let e = 0;
      for (let n = 0; n < t.length; n++) {
        let o = t[(n + 1) % t.length];
        e += t[n].x * o.y - o.x * t[n].y;
      }
      return Math.abs(e) / 2;
    }
    case "count":
      return t.length;
    case "arclen": {
      let e = t.length === 3 && J(t[0], t[1], t[2]);
      return e ? Math.abs(e.sweep) * e.r : 0;
    }
    case "dim_aligned":
      return t.length >= 2 ? Y(t[0], t[1]) : 0;
    case "dim_linear":
      return t.length < 2
        ? 0
        : U(t)
          ? Math.abs(t[1].y - t[0].y)
          : Math.abs(t[1].x - t[0].x);
    case "dim_angular": {
      if (t.length < 3) return 0;
      let e = Math.abs(
        Math.atan2(t[2].y - t[0].y, t[2].x - t[0].x) -
          Math.atan2(t[1].y - t[0].y, t[1].x - t[0].x),
      );
      return e > Math.PI && (e = 2 * Math.PI - e), (e * 180) / Math.PI;
    }
    case "dim_radius":
      return t.length >= 2 ? Y(t[0], t[1]) : 0;
    case "dim_diameter":
      return t.length >= 2 ? 2 * Y(t[0], t[1]) : 0;
  }
  return 0;
}
function U(i) {
  let s = i[2] ?? i[1],
    t = Math.min(i[0].x, i[1].x),
    e = Math.max(i[0].x, i[1].x);
  return s.x < t || s.x > e;
}
function O(i, s, t, e, n = {}) {
  let o = (s.points ?? []).map(C);
  if (!o.length) return;
  let h = n.color ?? E(s.color),
    a = o.map(t);
  i.save(),
    (i.strokeStyle = h),
    (i.fillStyle = h),
    (i.lineWidth = n.width ?? 2),
    (i.lineJoin = i.lineCap = "round");
  let l = (r, f) => {
      i.beginPath(),
        r.forEach((y, x) => (x ? i.lineTo(y.x, y.y) : i.moveTo(y.x, y.y))),
        f && i.closePath(),
        i.stroke();
    },
    d = (r, f = 3.5) => {
      i.beginPath(), i.arc(r.x, r.y, f, 0, Math.PI * 2), i.fill();
    },
    c = (r, f, y = {}) => R(i, r, f, h, y),
    p = (r, f, y, x = 0, u = "center", k = "bottom") => {
      let M = Math.max(y * e, 9);
      i.save(), i.translate(r.x, r.y);
      let g = -x;
      (g > Math.PI / 2 || g < -Math.PI / 2) && (g += Math.PI),
        i.rotate(g),
        (i.font = `700 ${M}px ${D}`),
        (i.textAlign = u),
        (i.textBaseline = k),
        (i.direction = "rtl");
      let w = String(f).split(`
`);
      w.forEach((v, X) =>
        i.fillText(
          v,
          0,
          (X - (k === "bottom" ? w.length - 1 : 0)) * M * 1.3 - 2,
        ),
      ),
        i.restore();
    },
    m = (r, f) => {
      i.beginPath(),
        i.moveTo(
          r.x - 6 * Math.cos(f + Math.PI / 4),
          r.y + 6 * Math.sin(f + Math.PI / 4),
        ),
        i.lineTo(
          r.x + 6 * Math.cos(f + Math.PI / 4),
          r.y - 6 * Math.sin(f + Math.PI / 4),
        ),
        i.stroke();
    },
    b = (r, f, y = 12) => {
      let x = Math.atan2(f.y - r.y, f.x - r.x);
      i.beginPath(),
        i.moveTo(f.x, f.y),
        i.lineTo(f.x - y * Math.cos(x - 0.4), f.y - y * Math.sin(x - 0.4)),
        i.lineTo(f.x - y * Math.cos(x + 0.4), f.y - y * Math.sin(x + 0.4)),
        i.closePath(),
        i.fill();
    },
    T = n.dimText ?? ((r) => String(Math.round(r * 100) / 100)),
    S = s.h ?? 12 / e;
  switch (s.kind) {
    case "dist":
    case "cont":
    case "length": {
      l(a), a.forEach((r) => d(r)), n.text && c(z(a), n.text);
      break;
    }
    case "area": {
      (i.globalAlpha = 0.18),
        i.beginPath(),
        a.forEach((r, f) => (f ? i.lineTo(r.x, r.y) : i.moveTo(r.x, r.y))),
        i.closePath(),
        i.fill(),
        (i.globalAlpha = 1),
        l(a, a.length > 2),
        a.forEach((r) => d(r, 3)),
        n.text && c(tt(a), n.text);
      break;
    }
    case "count":
      a.forEach((r, f) => {
        d(r, 9),
          (i.fillStyle = "#fff"),
          (i.font = `700 10px ${D}`),
          (i.textAlign = "center"),
          (i.textBaseline = "middle"),
          i.fillText(String(f + 1), r.x, r.y + 1),
          (i.fillStyle = h);
      }),
        n.text &&
          a.length &&
          c({ x: a[a.length - 1].x, y: a[a.length - 1].y - 12 }, n.text);
      break;
    case "idpt": {
      let r = a[0];
      i.beginPath(),
        i.moveTo(r.x - 7, r.y),
        i.lineTo(r.x + 7, r.y),
        i.moveTo(r.x, r.y - 7),
        i.lineTo(r.x, r.y + 7),
        i.stroke(),
        n.text && c({ x: r.x, y: r.y - 8 }, n.text);
      break;
    }
    case "arclen":
    case "arc": {
      if (o.length === 3) {
        let r = J(o[0], o[1], o[2]);
        if (r) {
          let f = t(r);
          i.beginPath(),
            i.arc(f.x, f.y, r.r * e, -r.a0, -(r.a0 + r.sweep), r.sweep > 0),
            i.stroke();
        }
      } else l(a);
      s.kind === "arclen" && a.forEach((r) => d(r, 3)),
        n.text && c(a[1] ?? a[0], n.text);
      break;
    }
    case "dim_aligned":
    case "dim_linear": {
      if (o.length < 2) {
        a.forEach((P) => d(P, 3));
        break;
      }
      let r = o[0],
        f = o[1],
        y = o[2] ?? o[1],
        x,
        u;
      if (s.kind === "dim_linear")
        U(o.length > 2 ? o : [r, f, y])
          ? ((x = { x: y.x, y: r.y }), (u = { x: y.x, y: f.y }))
          : ((x = { x: r.x, y: y.y }), (u = { x: f.x, y: y.y }));
      else {
        let P = Y(r, f) || 1,
          I = { x: -(f.y - r.y) / P, y: (f.x - r.x) / P },
          _ = (y.x - r.x) * I.x + (y.y - r.y) * I.y;
        (x = { x: r.x + I.x * _, y: r.y + I.y * _ }),
          (u = { x: f.x + I.x * _, y: f.y + I.y * _ });
      }
      let [k, M, g, w] = [r, f, x, u].map(t);
      (i.lineWidth = 1.2), l([k, g]), l([M, w]), (i.lineWidth = 1.6), l([g, w]);
      let v = Math.atan2(u.y - x.y, u.x - x.x);
      m(g, v), m(w, v);
      let X = W(s.kind, s.points);
      p(z([g, w]), s.text ?? T(X), S, v);
      break;
    }
    case "dim_angular": {
      if (o.length < 3) {
        l(a);
        break;
      }
      let [r, f, y] = o,
        x = Math.min(Y(r, f), Y(r, y)) * 0.6,
        u = Math.atan2(f.y - r.y, f.x - r.x),
        M = Math.atan2(y.y - r.y, y.x - r.x) - u;
      for (; M > Math.PI; ) M -= 2 * Math.PI;
      for (; M < -Math.PI; ) M += 2 * Math.PI;
      let g = t(r);
      (i.lineWidth = 1.2),
        l([g, t(f)]),
        l([g, t(y)]),
        (i.lineWidth = 1.6),
        i.beginPath(),
        i.arc(g.x, g.y, x * e, -u, -(u + M), M > 0),
        i.stroke();
      let w = u + M / 2,
        v = W("dim_angular", s.points);
      p(
        t({ x: r.x + Math.cos(w) * x * 1.08, y: r.y + Math.sin(w) * x * 1.08 }),
        s.text ?? `${Math.round(v * 10) / 10}\xB0`,
        S,
        w - Math.PI / 2,
      );
      break;
    }
    case "dim_radius":
    case "dim_diameter": {
      if (o.length < 2) break;
      let [r, f] = o,
        y =
          s.kind === "dim_diameter"
            ? { x: 2 * r.x - f.x, y: 2 * r.y - f.y }
            : r,
        x = t(y),
        u = t(f);
      (i.lineWidth = 1.6),
        l([x, u]),
        b(x, u, 10),
        s.kind === "dim_diameter" && b(u, x, 10);
      let k = W(s.kind, s.points);
      p(
        z([x, u]),
        s.text ?? `${s.kind === "dim_radius" ? "R" : "\xD8"}${T(k)}`,
        S,
        Math.atan2(f.y - y.y, f.x - y.x),
      );
      break;
    }
    case "pen":
    case "sketch":
    case "polyline":
      l(a, s.closed);
      break;
    case "line":
      l(a);
      break;
    case "arrow": {
      (i.lineWidth = 2),
        l(a),
        a.length > 1 && b(a[0], a[1], 14),
        s.text && p(a[0], s.text, S, 0, "center", "bottom");
      break;
    }
    case "text":
      p(a[0], s.text ?? "", S, 0, "right", "alphabetic");
      break;
    case "circle":
      o.length > 1 &&
        (i.beginPath(),
        i.arc(a[0].x, a[0].y, Y(o[0], o[1]) * e, 0, Math.PI * 2),
        i.stroke());
      break;
    case "rect":
      a.length > 1 &&
        l([a[0], { x: a[1].x, y: a[0].y }, a[1], { x: a[0].x, y: a[1].y }], !0);
      break;
    case "ellipse": {
      if (o.length < 2) break;
      let [r, f] = o,
        y = Y(r, f),
        x = o[2]
          ? Math.abs(
              ((o[2].x - r.x) * -(f.y - r.y) + (o[2].y - r.y) * (f.x - r.x)) /
                (y || 1),
            )
          : y / 2,
        u = t(r);
      i.beginPath(),
        i.ellipse(
          u.x,
          u.y,
          y * e,
          x * e,
          -Math.atan2(f.y - r.y, f.x - r.x),
          0,
          Math.PI * 2,
        ),
        i.stroke();
      break;
    }
    case "revcloud": {
      if (o.length < 2) break;
      let [r, f] = o,
        y = [r, { x: f.x, y: r.y }, f, { x: r.x, y: f.y }],
        x = (f.x - r.x) * (f.y - r.y) > 0,
        u = s.bump ?? Math.max(Math.abs(f.x - r.x), Math.abs(f.y - r.y)) / 12;
      i.beginPath();
      for (let k = 0; k < 4; k++) {
        let M = y[k],
          g = y[(k + 1) % 4],
          w = Y(M, g),
          v = Math.max(1, Math.round(w / u));
        for (let X = 0; X < v; X++) {
          let P = t({
              x: M.x + ((g.x - M.x) * X) / v,
              y: M.y + ((g.y - M.y) * X) / v,
            }),
            I = t({
              x: M.x + ((g.x - M.x) * (X + 1)) / v,
              y: M.y + ((g.y - M.y) * (X + 1)) / v,
            }),
            _ = (P.x + I.x) / 2,
            $ = (P.y + I.y) / 2,
            V = Math.hypot(I.x - P.x, I.y - P.y) / 2,
            j = Math.atan2(P.y - $, P.x - _);
          X === 0 && k === 0 && i.moveTo(P.x, P.y),
            i.arc(_, $, V, j, j + Math.PI, !x);
        }
      }
      i.stroke();
      break;
    }
    case "pin":
      N(i, a[0], "#e5484d", String(s.n ?? ""), "pin");
      break;
    case "image":
      N(i, a[0], "#3a7bd5", "", "image");
      break;
    case "audio":
      N(i, a[0], "#8e4ec6", "", "audio");
      break;
  }
  if (n.selected) {
    (i.strokeStyle = "#4cd6ff"), i.setLineDash([5, 4]), (i.lineWidth = 1.5);
    let r = a.reduce(
      (f, y) => ({
        minX: Math.min(f.minX, y.x),
        minY: Math.min(f.minY, y.y),
        maxX: Math.max(f.maxX, y.x),
        maxY: Math.max(f.maxY, y.y),
      }),
      { minX: 1 / 0, minY: 1 / 0, maxX: -1 / 0, maxY: -1 / 0 },
    );
    i.strokeRect(
      r.minX - 10,
      r.minY - 10,
      r.maxX - r.minX + 20,
      r.maxY - r.minY + 20,
    );
  }
  i.restore();
}
function R(i, s, t, e, { below: n = !1 } = {}) {
  i.save(), (i.font = `700 13px ${D}`), (i.direction = "rtl");
  let o = i.measureText(t).width + 12,
    h = n ? s.y + 6 : s.y - 26;
  (i.fillStyle = "rgba(20,24,30,.88)"),
    q(i, s.x - o / 2, h, o, 20, 5),
    i.fill(),
    (i.fillStyle = e === "#000000" ? "#ffffff" : e),
    (i.textAlign = "center"),
    (i.textBaseline = "middle"),
    i.fillText(t, s.x, h + 11),
    i.restore();
}
function q(i, s, t, e, n, o) {
  i.beginPath(),
    i.moveTo(s + o, t),
    i.arcTo(s + e, t, s + e, t + n, o),
    i.arcTo(s + e, t + n, s, t + n, o),
    i.arcTo(s, t + n, s, t, o),
    i.arcTo(s, t, s + e, t, o),
    i.closePath();
}
var G = {
  image: "M-6 -26h12v9h-12z M-4 -19l3 -4 2 2 2 -3 3 5",
  audio: "M-1 -27v8 M-4 -22a3 3 0 0 0 6 0 M-5 -15h8",
};
function N(i, s, t, e, n) {
  i.save(),
    i.translate(s.x, s.y),
    i.beginPath(),
    i.moveTo(0, 0),
    i.bezierCurveTo(-4, -8, -11, -12, -11, -21),
    i.arc(0, -21, 11, Math.PI, 0),
    i.bezierCurveTo(11, -12, 4, -8, 0, 0),
    (i.fillStyle = t),
    i.fill(),
    (i.strokeStyle = "#fff"),
    (i.lineWidth = 1.5),
    i.stroke(),
    G[n]
      ? ((i.strokeStyle = "#fff"),
        (i.lineWidth = 1.5),
        i.stroke(new Path2D(G[n])))
      : ((i.fillStyle = "#fff"),
        (i.font = "700 11px sans-serif"),
        (i.textAlign = "center"),
        (i.textBaseline = "middle"),
        i.fillText(e, 0, -21)),
    i.restore();
}
function z(i) {
  return i.length === 1
    ? i[0]
    : i.length === 2
      ? { x: (i[0].x + i[1].x) / 2, y: (i[0].y + i[1].y) / 2 }
      : i[Math.floor(i.length / 2)];
}
function tt(i) {
  let s = 0,
    t = 0;
  for (let e of i) (s += e.x), (t += e.y);
  return { x: s / i.length, y: t / i.length };
}
function H(i, s, t, e) {
  let n = (i.points ?? []).map(C).map(s);
  if (!n.length) return 1 / 0;
  if (["pin", "image", "audio"].includes(i.kind))
    return Math.hypot(n[0].x - t, n[0].y - 21 - e) - 6;
  let o = 1 / 0;
  for (let h of n) o = Math.min(o, Math.hypot(h.x - t, h.y - e));
  for (let h = 1; h < n.length; h++) o = Math.min(o, B(t, e, n[h - 1], n[h]));
  if (i.kind === "rect" || i.kind === "revcloud") {
    let [h, a] = n;
    if (
      a &&
      t >= Math.min(h.x, a.x) - 6 &&
      t <= Math.max(h.x, a.x) + 6 &&
      e >= Math.min(h.y, a.y) - 6 &&
      e <= Math.max(h.y, a.y) + 6
    ) {
      let l = Math.min(
        Math.abs(t - h.x),
        Math.abs(t - a.x),
        Math.abs(e - h.y),
        Math.abs(e - a.y),
      );
      o = Math.min(o, l);
    }
  }
  return o;
}
function B(i, s, t, e) {
  let n = e.x - t.x,
    o = e.y - t.y,
    h = n * n + o * o,
    a = h ? Math.max(0, Math.min(1, ((i - t.x) * n + (s - t.y) * o) / h)) : 0;
  return Math.hypot(i - (t.x + a * n), s - (t.y + a * o));
}
var SNAP_KINDS = ["end", "mid", "cen", "quad", "ins", "node", "perp", "ext", "near"],
  SNAP_DEFAULT_OFF = [],
  SNAP_AR = { end: "نهاية", mid: "منتصف", cen: "مركز", quad: "ربع دايرة", ins: "نقطة إدراج", node: "نقطة", perp: "عمودي", ext: "امتداد", near: "أقرب نقطة" };
var st = 14,
  K = class {
    constructor(s, t, e) {
      try {
        this.ortho = localStorage.getItem("sitepro.ortho") === "1";
      } catch {}
      this.osnap = new Set(SNAP_KINDS.filter((k) => SNAP_DEFAULT_OFF.indexOf(k) < 0));
      try {
        let v = localStorage.getItem("sitepro.osnap");
        v !== null && (this.osnap = new Set(v.split(",").filter(Boolean)));
      } catch {}
      (this.doc = t),
        (this.opts = e),
        (this.canvas = document.createElement("canvas")),
        (this.canvas.className = "stage"),
        s.appendChild(this.canvas),
        (this.ctx = this.canvas.getContext("2d")),
        (this.spaces = [
          { name: "Model", entities: t.entities },
          ...t.layouts.map((n) => ({ ...n })),
        ]),
        (this.tool = "pan"),
        (this.points = []),
        (this.stroke = null),
        (this.box = null),
        (this.markups = []),
        (this.hiddenMarkLayers = new Set()),
        (this.light = !1),
        (this.color = 16726832),
        (this.snapPt = null),
        (this.highlight = null),
        (this.ptrs = new Map()),
        this.setSpace(0),
        new ResizeObserver(() => this.resize()).observe(s),
        this.resize(),
        this.fit(),
        this.bind();
    }
    get model() {
      return this.spaces[0].flat;
    }
    get isModel() {
      return this.space === 0;
    }
    setSpace(s) {
      this.entSel && ((this.entSel = null), this.opts.onSelectEntity?.(null));
      let t = this.spaces[s];
      if (!t.flat && ((t.flat = L(this.doc, t.entities)), Q(t.flat), s > 0)) {
        for (let [e, n] of Object.entries(t.flat.layers))
          this.model.layers[e] &&
            (t.flat.layers[e] = Object.assign(n, {
              off: this.model.layers[e].off,
            }));
        t.bbox = it(t);
      }
      (this.space = s),
        (this.flat = t.flat),
        (this.highlight = null),
        this.setTool("pan"),
        this.w && this.fit();
    }
    resize() {
      let s = window.devicePixelRatio || 1,
        t = this.canvas.getBoundingClientRect();
      this.w && t.width && (this.scale *= t.width / this.w),
        (this.w = t.width),
        (this.h = t.height),
        (this.canvas.width = Math.max(1, t.width * s)),
        (this.canvas.height = Math.max(1, t.height * s)),
        (this.dpr = s),
        this.draw();
    }
    fit(s) {
      s ??= this.isModel ? this.flat.view : this.spaces[this.space].bbox;
      let t = Math.max(s.maxX - s.minX, 1e-6),
        e = Math.max(s.maxY - s.minY, 1e-6);
      (this.scale = 0.92 * Math.min(this.w / t, this.h / e) || 1),
        (this.cx = (s.minX + s.maxX) / 2),
        (this.cy = (s.minY + s.maxY) / 2),
        this.draw();
    }
    toScreen(s) {
      return {
        x: (s.x - this.cx) * this.scale + this.w / 2,
        y: this.h / 2 - (s.y - this.cy) * this.scale,
      };
    }
    toWorld(s, t) {
      return {
        x: (s - this.w / 2) / this.scale + this.cx,
        y: (this.h / 2 - t) / this.scale + this.cy,
      };
    }
    zoomAt(s, t, e) {
      let n = this.toWorld(s, t);
      this.scale *= e;
      let o = this.toWorld(s, t);
      (this.cx += n.x - o.x), (this.cy += n.y - o.y), this.draw();
    }
    bind() {
      let s = this.canvas;
      s.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault(),
            this.zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015));
        },
        { passive: !1 },
      ),
        s.addEventListener("pointerdown", (e) => {
          s.setPointerCapture(e.pointerId),
            this.ptrs.set(e.pointerId, {
              x: e.offsetX,
              y: e.offsetY,
              x0: e.offsetX,
              y0: e.offsetY,
            }),
            this.ptrs.size === 1
              ? (this.tool === "sketch" &&
                  (this.stroke = [this.toWorld(e.offsetX, e.offsetY)]),
                (this.tool === "revcloud" || this.tool === "zoomwin") &&
                  (this.box = [
                    this.snapOr(e.offsetX, e.offsetY),
                    this.toWorld(e.offsetX, e.offsetY),
                  ]))
              : ((this.stroke = null), (this.box = null));
        }),
        s.addEventListener("pointermove", (e) => {
          let n = this.ptrs.get(e.pointerId);
          if (!n) {
            e.pointerType === "mouse" && this.hover(e.offsetX, e.offsetY);
            return;
          }
          if (this.ptrs.size === 2) {
            let [a, l] = [...this.ptrs.values()],
              d = Math.hypot(a.x - l.x, a.y - l.y),
              c = { x: (a.x + l.x) / 2, y: (a.y + l.y) / 2 };
            (n.x = e.offsetX), (n.y = e.offsetY);
            let p = Math.hypot(a.x - l.x, a.y - l.y),
              m = { x: (a.x + l.x) / 2, y: (a.y + l.y) / 2 };
            (this.cx -= (m.x - c.x) / this.scale),
              (this.cy += (m.y - c.y) / this.scale),
              d > 0 && this.zoomAt(m.x, m.y, p / d),
              (a.moved = l.moved = !0);
            return;
          }
          if (this.stroke) {
            this.stroke.push(this.toWorld(e.offsetX, e.offsetY)), this.draw();
            return;
          }
          if (this.box) {
            (this.box[1] = this.toWorld(e.offsetX, e.offsetY)), this.draw();
            return;
          }
          let o = e.offsetX - n.x,
            h = e.offsetY - n.y;
          (n.x = e.offsetX),
            (n.y = e.offsetY),
            Math.hypot(e.offsetX - n.x0, e.offsetY - n.y0) > 6 &&
              (n.moved = !0),
            n.moved &&
              ((this.cx -= o / this.scale),
              (this.cy += h / this.scale),
              this.draw()),
            e.pointerType !== "mouse" &&
              this.needsPoints() &&
              (this.cursor = this.toWorld(e.offsetX, e.offsetY));
        });
      let t = (e) => {
        let n = this.ptrs.get(e.pointerId),
          o = this.ptrs.size;
        if ((this.ptrs.delete(e.pointerId), !(!n || o > 1))) {
          if (this.stroke) {
            this.stroke.length > 1 &&
              this.create({
                kind: "sketch",
                points: et(this.stroke, 1.5 / this.scale).map((h) => [
                  h.x,
                  h.y,
                ]),
              }),
              (this.stroke = null),
              this.draw();
            return;
          }
          if (this.box) {
            let [h, a] = this.box;
            (this.box = null),
              Math.hypot(h.x - a.x, h.y - a.y) * this.scale > 10 &&
                (this.tool === "zoomwin"
                  ? (this.fit({
                      minX: Math.min(h.x, a.x),
                      maxX: Math.max(h.x, a.x),
                      minY: Math.min(h.y, a.y),
                      maxY: Math.max(h.y, a.y),
                    }),
                    this.setTool("pan"))
                  : this.create({
                      kind: "revcloud",
                      points: [
                        [h.x, h.y],
                        [a.x, a.y],
                      ],
                      bump:
                        Math.max(Math.abs(a.x - h.x), Math.abs(a.y - h.y)) / 10,
                    })),
              this.draw();
            return;
          }
          n.moved || this.tap(e.offsetX, e.offsetY);
        }
      };
      s.addEventListener("pointerup", t),
        s.addEventListener("pointercancel", (e) => {
          this.ptrs.delete(e.pointerId),
            (this.stroke = null),
            (this.box = null);
        });
    }
    needsPoints() {
      return A[this.tool] !== void 0;
    }
    hover(s, t) {
      this.needsPoints() &&
        ((this.snapPt = this.nearestSnap(s, t)),
        (this.cursor = this.orthoFix(this.snapPt, s, t)),
        this.cursor !== this.snapPt && (this.snapPt = null),
        this.draw());
    }
    // Object snaps, like AutoCAD OSNAP: point snaps first (end, mid, center...),
    // then perpendicular from the last point, extension, and nearest on a line.
    nearestSnap(s, t) {
      let e = this.flat,
        n = this.toWorld(s, t),
        o = st / this.scale,
        on = this.osnap,
        h = Math.ceil(o / e.cell),
        d = null,
        c = o;
      if (on.size === 0) return null;
      if (h <= 40) {
        let a = Math.floor(n.x / e.cell),
          l = Math.floor(n.y / e.cell);
        for (let p = -h; p <= h; p++)
          for (let m = -h; m <= h; m++)
            for (let b of e.snapGrid.get(a + p + "," + (l + m)) ?? []) {
              if (!on.has(b.k ?? "end") || e.layers[e.layerNames[b.l]]?.off) continue;
              let T = Math.hypot(b.x - n.x, b.y - n.y);
              T < c && ((c = T), (d = b));
            }
      }
      if (d) return { x: d.x, y: d.y, k: d.k ?? "end" };
      let g = e.segs,
        last = this.points[this.points.length - 1],
        R = on.has("ext") ? o * 12 : o,
        perp = null,
        ext = null,
        near = null,
        dp = o,
        de = o,
        dn = o;
      for (let q of e.segIndex.query(n.x - R, n.y - R, n.x + R, n.y + R)) {
        let i = q * 6;
        if (e.layers[e.layerNames[g[i + 4]]]?.off) continue;
        let ax = g[i], ay = g[i + 1], bx = g[i + 2], by = g[i + 3],
          vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
        if (!L2) continue;
        let u = ((n.x - ax) * vx + (n.y - ay) * vy) / L2,
          px = ax + u * vx, py = ay + u * vy,
          off = Math.hypot(n.x - px, n.y - py);
        if (u >= 0 && u <= 1) {
          if (on.has("near") && off < dn) (dn = off), (near = { x: px, y: py, k: "near" });
          if (on.has("perp") && last) {
            let w = ((last.x - ax) * vx + (last.y - ay) * vy) / L2;
            if (w >= 0 && w <= 1) {
              let fx = ax + w * vx, fy = ay + w * vy, df = Math.hypot(n.x - fx, n.y - fy);
              df < dp && Math.hypot(fx - last.x, fy - last.y) > o && ((dp = df), (perp = { x: fx, y: fy, k: "perp" }));
            }
          }
        } else if (on.has("ext") && off < de && L2 > 4 * o * o) {
          // Beyond an end of a real (not tessellated) line: snap onto its extension.
          let from = u < 0 ? { x: ax, y: ay } : { x: bx, y: by };
          Math.hypot(px - from.x, py - from.y) < R && ((de = off), (ext = { x: px, y: py, k: "ext", from }));
        }
      }
      return perp ?? ext ?? near;
    }
    snapOr(s, t) {
      return this.orthoFix(this.nearestSnap(s, t), s, t);
    }
    // Ortho (F8): from the last point, only horizontal or vertical. An exact
    // object snap (end, mid, center...) still wins, like in AutoCAD.
    orthoFix(sp, s, t) {
      let last = this.points[this.points.length - 1];
      if (!this.ortho || !last) return sp ?? this.toWorld(s, t);
      if (sp && sp.k !== "near" && sp.k !== "ext") return sp;
      let w = this.toWorld(s, t);
      return Math.abs(w.x - last.x) >= Math.abs(w.y - last.y) ? { x: w.x, y: last.y } : { x: last.x, y: w.y };
    }
    pickSegment(s, t) {
      let e = this.flat,
        n = e.segs,
        o = this.toWorld(s, t),
        h = 12 / this.scale,
        a = -1,
        l = h;
      for (let d of e.segIndex.query(o.x - h, o.y - h, o.x + h, o.y + h)) {
        let c = d * 6;
        if (e.layers[e.layerNames[n[c + 4]]]?.off) continue;
        let p = B(
          o.x,
          o.y,
          { x: n[c], y: n[c + 1] },
          { x: n[c + 2], y: n[c + 3] },
        );
        p < l && ((l = p), (a = c));
      }
      return a < 0 ? null : { layer: e.layerNames[n[a + 4]], insert: n[a + 5] };
    }
    selectEntityAt(s, t) {
      let f = this.flat,
        n = f.segs,
        o = this.toWorld(s, t),
        h = 12 / this.scale,
        best = -1,
        bd = h;
      for (let d of f.segIndex.query(o.x - h, o.y - h, o.x + h, o.y + h)) {
        let c = d * 6;
        if (f.layers[f.layerNames[n[c + 4]]]?.off) continue;
        let p = B(o.x, o.y, { x: n[c], y: n[c + 1] }, { x: n[c + 2], y: n[c + 3] });
        p < bd && ((bd = p), (best = c));
      }
      if (best < 0 || (this.entSel && this.entSel.at === best)) {
        // Tap on empty space (or the same object again) clears the selection.
        this.entSel = null;
        this.opts.onSelectEntity?.(null);
        return this.draw();
      }
      let ins = n[best + 5],
        id = f.eids?.[best / 6] ?? -1,
        segs = [],
        len = 0,
        total = n.length / 6;
      for (let j = 0; j < total; j++) {
        let c = j * 6;
        if (ins >= 0 ? n[c + 5] !== ins : f.eids[j] !== id) continue;
        len += Math.hypot(n[c + 2] - n[c], n[c + 3] - n[c + 1]);
        if (segs.length < 240000) segs.push(n[c], n[c + 1], n[c + 2], n[c + 3]);
      }
      let info;
      if (ins >= 0) {
        let I = f.inserts[ins];
        info = {
          kind: "block",
          name: I.name,
          layer: I.layer,
          count: f.inserts.filter((x) => x.name === I.name).length,
        };
      } else {
        let E = f.ents?.[id];
        info = {
          kind: "entity",
          type: E?.type ?? "",
          name: E?.name,
          layer: E?.layer ?? f.layerNames[n[best + 4]],
          color: E?.color,
          lengthM: len * this.opts.unitToM(),
        };
      }
      this.entSel = { at: best, segs, info };
      this.opts.onSelectEntity?.(info);
      this.draw();
    }
    clearEntitySel() {
      this.entSel && ((this.entSel = null), this.opts.onSelectEntity?.(null), this.draw());
    }
    pickCircle(s, t) {
      let e = this.toWorld(s, t),
        n = 14 / this.scale,
        o = null,
        h = n;
      for (let a of this.flat.circles) {
        if (this.flat.layers[this.flat.layerNames[a.layer]]?.off) continue;
        let l = Math.abs(Math.hypot(e.x - a.c.x, e.y - a.c.y) - a.r);
        l < h && ((h = l), (o = a));
      }
      return o;
    }
    pickInsert(s, t) {
      let e = this.pickSegment(s, t);
      if (e && e.insert >= 0) return this.flat.inserts[e.insert];
      let n = this.toWorld(s, t),
        o = null,
        h = 1 / 0;
      for (let a of this.flat.inserts) {
        let l = a.box;
        if (n.x < l.minX || n.x > l.maxX || n.y < l.minY || n.y > l.maxY)
          continue;
        let d = (l.maxX - l.minX) * (l.maxY - l.minY);
        d < h && ((h = d), (o = a));
      }
      return o;
    }
    pickMark(s, t) {
      let e = (h) => this.toScreen(h),
        n = null,
        o = 14;
      for (let h of this.visibleMarks()) {
        let a = H(h, e, s, t);
        a < o && ((o = a), (n = h));
      }
      return n;
    }
    setTool(s) {
      (this.tool = s),
        (this.points = []),
        (this.stroke = null),
        (this.box = null),
        (this.snapPt = null),
        (this.cursor = null),
        s !== "select" && (this.selected = null),
        s !== "select" && s !== "pan" && this.clearEntitySel(),
        this.pending(),
        this.draw();
    }
    async tap(s, t) {
      let e = this.tool;
      if (e === "pan" || e === "select") {
        let a = this.pickMark(s, t);
        if (a && e === "pan" && ["pin", "image", "audio"].includes(a.kind))
          return this.opts.onTapMark(a);
        if (a && e === "select") {
          this.entSel = null;
          this.selected = a;
          this.opts.onSelectMark?.(a);
          return this.draw();
        }
        // Otherwise select the drawing object (line, polyline, text, block...) under the finger.
        this.selected = null;
        this.selectEntityAt(s, t);
        return;
      }
      if (e === "layoff" || e === "isolate") {
        let a = this.pickSegment(s, t);
        a && this.opts.onPick(e, a.layer);
        return;
      }
      if (e === "countblock") {
        let a = this.pickInsert(s, t);
        (this.highlight = a
          ? this.flat.inserts.filter((l) => l.name === a.name)
          : null),
          this.opts.onPick(e, a?.name ?? null, this.highlight?.length ?? 0),
          this.draw();
        return;
      }
      if (!this.isModel) return;
      if (e === "dim_radius" || e === "dim_diameter") {
        let a = this.pickCircle(s, t);
        if (!a)
          return this.opts.toast(
            "\u0627\u0636\u063A\u0637 \u0639\u0644\u0649 \u062F\u0627\u064A\u0631\u0629 \u0623\u0648 \u0642\u0648\u0633",
          );
        let l = this.toWorld(s, t),
          d = Math.atan2(l.y - a.c.y, l.x - a.c.x);
        this.create({
          kind: e,
          points: [
            [a.c.x, a.c.y],
            [a.c.x + a.r * Math.cos(d), a.c.y + a.r * Math.sin(d)],
          ],
        });
        return;
      }
      let n = A[e];
      if (n === void 0) return;
      let h =
        (e.startsWith("dim_") && this.points.length === 2) ||
        (e === "ellipse" && this.points.length === 2)
          ? this.toWorld(s, t)
          : this.snapOr(s, t);
      if (
        (this.points.push(h),
        (this.snapPt = null),
        n && this.points.length >= n)
      ) {
        let a = this.points.map((l) => [l.x, l.y]);
        (this.points =
          e === "line" ? [this.points[this.points.length - 1]] : []),
          await this.createFromTool(e, a);
      }
      this.pending(), this.draw();
    }
    async createFromTool(s, t) {
      let e = { kind: s, points: t };
      if (s === "text" || s === "arrow") {
        let n = await this.opts.prompt(
          s === "text"
            ? "\u0627\u0644\u0646\u0635"
            : "\u0646\u0635 \u0639\u0644\u0649 \u0627\u0644\u0633\u0647\u0645 (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)",
          s === "arrow",
        );
        if (n === null || (s === "text" && !n.trim())) return;
        n && (e.text = n);
      }
      this.create(e);
    }
    create(s) {
      (s.color ??= this.color),
        [
          "text",
          "arrow",
          "dim_aligned",
          "dim_linear",
          "dim_angular",
          "dim_radius",
          "dim_diameter",
        ].includes(s.kind) && (s.h ??= 13 / this.scale);
      let t = this.valueM(s);
      t !== null && (s.value = t), this.opts.onCreate(s);
    }
    valueM(s) {
      let t = this.opts.unitToM(),
        e = W(s.kind, s.points);
      switch (s.kind) {
        case "dist":
        case "cont":
        case "arclen":
          return e * t;
        case "area":
          return e * t * t;
        case "count":
        case "dim_angular":
          return e;
        case "dim_aligned":
        case "dim_linear":
        case "dim_radius":
        case "dim_diameter":
          return e * t;
      }
      return null;
    }
    pending() {
      let s = this.tool,
        t = this.points.length;
      if (
        !["cont", "area", "count", "polyline", "line"].includes(s) ||
        (s === "line" && !t)
      )
        return this.opts.onPending(null);
      let e = { kind: s, points: this.points.map((o) => [o.x, o.y]) },
        n = s === "area" ? t >= 3 : s === "count" ? t >= 1 : t >= 2;
      this.opts.onPending({
        kind: s,
        n: t,
        value: this.valueM(e),
        ready: s === "line" ? !1 : n,
        finishOnly: s === "line",
      });
    }
    undoPoint() {
      this.points.pop(), this.pending(), this.draw();
    }
    finish(s) {
      let t = this.tool,
        e = this.points.map((o) => [o.x, o.y]);
      if (((this.points = []), t === "line" || !e.length)) {
        this.pending(), this.draw();
        return;
      }
      let n = { kind: t, points: e };
      t === "polyline" && s && (n.closed = !0),
        this.create(n),
        this.pending(),
        this.draw();
    }
    setMarkups(s) {
      (this.markups = s ?? []),
        this.selected &&
          (this.selected =
            this.markups.find((t) => t.id === this.selected.id) ?? null),
        this.draw();
    }
    visibleMarks() {
      return this.isModel
        ? this.markups.filter((s) => !this.hiddenMarkLayers.has(s.layer ?? ""))
        : [];
    }
    focusMarkup(s) {
      let t = s.points ?? [];
      if (!t.length || !this.isModel) return;
      let e = 1 / 0,
        n = 1 / 0,
        o = -1 / 0,
        h = -1 / 0;
      for (let [l, d] of t)
        (e = Math.min(e, l)),
          (n = Math.min(n, d)),
          (o = Math.max(o, l)),
          (h = Math.max(h, d));
      let a =
        Math.max(
          o - e,
          h - n,
          (this.flat.view.maxX - this.flat.view.minX) / 40,
        ) * 0.6;
      this.fit({ minX: e - a, maxX: o + a, minY: n - a, maxY: h + a }),
        (this.selected = s),
        this.draw();
    }
    focusPoint(s, t) {
      let e = Math.max(t * 15, 0.001);
      this.fit({ minX: s.x - e, maxX: s.x + e, minY: s.y - e, maxY: s.y + e });
    }
    setLight(s) {
      (this.light = s), this.draw();
    }
    draw() {
      !this.ctx ||
        !this.w ||
        this._raf ||
        (this._raf = requestAnimationFrame(() => {
          (this._raf = 0), this.paint();
        }));
    }
    ink(s) {
      return (
        (s &= 16777215),
        this.light && s === 16777215
          ? "#000000"
          : !this.light && s === 0
            ? "#ffffff"
            : E(s)
      );
    }
    paintFlat(s, t, e) {
      let n = this.ctx,
        o = this.dpr;
      n.setTransform(
        o * t[0],
        o * t[1],
        o * t[2],
        o * t[3],
        o * t[4],
        o * t[5],
      ),
        (n.lineWidth = 1 / e),
        (n.lineJoin = "round");
      for (let l of s.layerNames) {
        let d = s.layers[l];
        if (!d.off) {
          for (let c of d.fillPaths)
            (n.globalAlpha = c.alpha),
              (n.fillStyle = this.ink(c.color)),
              n.fill(c.path, "evenodd");
          n.globalAlpha = 1;
          // Lineweights: 0.25 mm and less = 1 px, heavier ones ~ like AutoCAD's LWDISPLAY.
          for (let c of d.paths)
            (n.lineWidth = (c.lw > 25 ? Math.min(6, c.lw / 26) : 1) / e),
              (n.strokeStyle = this.ink(c.color)),
              n.stroke(c.path);
        }
      }
      n.setTransform(o, 0, 0, o, 0, 0);
      let h = (l) => ({
          x: t[0] * l.x + t[2] * l.y + t[4],
          y: t[1] * l.x + t[3] * l.y + t[5],
        }),
        a = Math.atan2(-t[1], t[0]);
      for (let l of s.layerNames) {
        let d = s.layers[l];
        if (!d.off)
          for (let c of d.texts) {
            let p = c.h * e;
            if (p < 4) continue;
            let m = h(c.p);
            if (
              m.x < -3e3 ||
              m.x > this.w + 3e3 ||
              m.y < -600 ||
              m.y > this.h + 600
            )
              continue;
            n.save(),
              n.translate(m.x, m.y),
              n.rotate(-c.rot + a),
              (n.fillStyle = this.ink(c.color)),
              (n.font = `${p}px "Segoe UI", Tahoma, sans-serif`);
            let b = (c.att - 1) % 3,
              T = Math.floor((c.att - 1) / 3);
            (n.textAlign = b === 0 ? "left" : b === 1 ? "center" : "right"),
              (n.textBaseline =
                T === 0 ? "top" : T === 1 ? "middle" : "alphabetic"),
              (n.direction = "ltr"),
              c.wf && c.wf !== 1 && n.scale(c.wf, 1),
              textLines(n, c).forEach((S, r) =>
                n.fillText(S, 0, (r - (T === 2 ? textLines(n, c).length - 1 : T === 1 ? (textLines(n, c).length - 1) / 2 : 0)) * p * 1.35 * (c.ls || 1)),
              ),
              n.restore();
          }
      }
    }
    // Big drawings take long to redraw, so while the view moves the last full
    // frame is reused (scaled/moved) and the full redraw waits until it stops.
    paint() {
      let now = performance.now(),
        key = this.frameKey(),
        snap = this._snap;
      if (snap && snap.key === key) {
        let same = snap.cx === this.cx && snap.cy === this.cy && snap.scale === this.scale;
        // (Canvas work is mostly done after paint() returns, so size counts too.)
        if (same || this._cost > 40 || (this.flat?.size ?? 0) > 150000) {
          this.blit(snap, !same);
          this.paintOverlay();
          if (!same) {
            clearTimeout(this._full);
            this._full = setTimeout(() => ((this._snap = null), this.draw(), this.buildOverview()), 150);
          }
          return;
        }
      }
      this.paintDrawing();
      this._cost = performance.now() - now;
      this._ov?.key !== this.ovKey() && (clearTimeout(this._ovT), (this._ovT = setTimeout(() => this.buildOverview(), 600)));
      let c = (this._snapCanvas ??= document.createElement("canvas"));
      (c.width !== this.canvas.width || c.height !== this.canvas.height) &&
        ((c.width = this.canvas.width), (c.height = this.canvas.height)),
        c.getContext("2d").drawImage(this.canvas, 0, 0),
        (this._snap = { key, cx: this.cx, cy: this.cy, scale: this.scale, canvas: c });
      this.paintOverlay();
    }
    frameKey() {
      let f = this.flat,
        k = this.space + "|" + this.w + "x" + this.h + "|" + this.dpr + "|" + !!this.light + "|";
      for (let l of f?.layerNames ?? []) k += f.layers[l].off ? "0" : "1";
      // Viewports in a layout draw the model, so its layers count too.
      if (this.model && this.model !== f) {
        k += "|";
        for (let l of this.model.layerNames ?? []) k += this.model.layers[l].off ? "0" : "1";
      }
      return k;
    }
    blit(snap, moving) {
      let s = this.ctx,
        e = this.dpr,
        put = (S, W, H) => {
          let r = this.scale / S.scale,
            tx = this.w / 2 + (S.cx - this.cx) * this.scale - (W / 2) * r,
            ty = this.h / 2 - (S.cy - this.cy) * this.scale - (H / 2) * r;
          s.setTransform(e * r, 0, 0, e * r, e * tx, e * ty), s.drawImage(S.canvas, 0, 0, W, H);
        };
      s.setTransform(e, 0, 0, e, 0, 0),
        (s.fillStyle = this.light ? "#ffffff" : "#1d2127"),
        s.fillRect(0, 0, this.w, this.h);
      // While moving, the whole-drawing picture fills the parts the last frame did not cover.
      let ov = this._ov;
      moving && ov && ov.key === this.ovKey() && put(ov, ov.W, ov.H);
      put(snap, this.w, this.h), s.setTransform(e, 0, 0, e, 0, 0);
    }
    ovKey() {
      let k = this.frameKey().split("|");
      return (k[1] = k[2] = ""), k.join("|");
    }
    // A one-off picture of the whole drawing, so panning and zooming out never show empty areas.
    buildOverview() {
      let f = this.flat;
      if (!f || (f.size ?? 0) <= 150000 || this._ov?.key === this.ovKey()) return;
      let v = f.view ?? f.bbox,
        bw = v.maxX - v.minX,
        bh = v.maxY - v.minY;
      if (!(bw > 0 && bh > 0)) return;
      let M = 2048,
        sc = M / Math.max(bw, bh),
        W = Math.max(1, Math.round(bw * sc)),
        H = Math.max(1, Math.round(bh * sc)),
        c = (this._ov?.canvas ?? document.createElement("canvas"));
      (c.width = W), (c.height = H);
      let keep = [this.ctx, this.w, this.h, this.dpr, this.cx, this.cy, this.scale];
      try {
        (this.ctx = c.getContext("2d")), (this.w = W), (this.h = H), (this.dpr = 1),
          (this.cx = (v.minX + v.maxX) / 2), (this.cy = (v.minY + v.maxY) / 2), (this.scale = sc);
        this.paintDrawing();
        this._ov = { key: null, canvas: c, W, H, cx: this.cx, cy: this.cy, scale: sc };
      } finally {
        [this.ctx, this.w, this.h, this.dpr, this.cx, this.cy, this.scale] = keep;
      }
      this._ov.key = this.ovKey();
    }
    paintDrawing() {
      let s = this.ctx,
        t = this.scale,
        e = this.dpr;
      s.setTransform(e, 0, 0, e, 0, 0),
        (s.fillStyle = this.light ? "#ffffff" : "#1d2127"),
        s.fillRect(0, 0, this.w, this.h);
      let n = [t, 0, 0, -t, this.w / 2 - this.cx * t, this.h / 2 + this.cy * t];
      if (!this.isModel) {
        let o = this.spaces[this.space];
        if (o.limits) {
          let h = this.toScreen(o.limits[0]),
            a = this.toScreen(o.limits[1]);
          (s.fillStyle = this.light ? "#f4f4f4" : "#2a2f37"),
            s.fillRect(
              Math.min(h.x, a.x),
              Math.min(h.y, a.y),
              Math.abs(a.x - h.x),
              Math.abs(a.y - h.y),
            );
        }
        this.model || (this.spaces[0].flat = Q(L(this.doc, this.doc.entities)));
        for (let h of o.viewports) {
          let a = h.h / h.vh,
            l = this.toScreen({ x: h.c.x - h.w / 2, y: h.c.y + h.h / 2 });
          s.save(), s.beginPath(), s.rect(l.x, l.y, h.w * t, h.h * t), s.clip();
          let d = Math.cos(h.twist),
            c = Math.sin(h.twist),
            p = a * d,
            m = a * c,
            b = -a * c,
            T = a * d,
            S = h.c.x - (p * h.vc.x + b * h.vc.y),
            r = h.c.y - (m * h.vc.x + T * h.vc.y),
            f = [
              n[0] * p,
              n[3] * m,
              n[0] * b,
              n[3] * T,
              n[0] * S + n[4],
              n[3] * r + n[5],
            ];
          this.paintFlat(this.model, f, t * a),
            s.restore(),
            s.setTransform(e, 0, 0, e, 0, 0),
            (s.strokeStyle = this.light ? "#999" : "#55606d"),
            (s.lineWidth = 1),
            s.strokeRect(l.x, l.y, h.w * t, h.h * t);
        }
      }
      this.paintFlat(this.flat, n, t);
    }
    paintOverlay() {
      let s = this.ctx;
      s.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      let t = (o) => this.toScreen(o);
      if (this.entSel) {
        let g = this.entSel.segs;
        s.beginPath();
        for (let j = 0; j < g.length; j += 4) {
          let a = t({ x: g[j], y: g[j + 1] }),
            b = t({ x: g[j + 2], y: g[j + 3] });
          s.moveTo(a.x, a.y), s.lineTo(b.x, b.y);
        }
        (s.strokeStyle = "rgba(76,214,255,.35)"), (s.lineWidth = 7), (s.lineCap = "round"), s.stroke();
        (s.strokeStyle = "#4cd6ff"), (s.lineWidth = 2), s.stroke();
      }
      if (this.highlight) {
        (s.strokeStyle = "#4cd6ff"), (s.lineWidth = 2);
        for (let o of this.highlight) {
          let h = t({ x: o.box.minX, y: o.box.maxY }),
            a = t({ x: o.box.maxX, y: o.box.minY });
          s.strokeRect(h.x - 3, h.y - 3, a.x - h.x + 6, a.y - h.y + 6);
        }
      }
      for (let o of this.visibleMarks())
        O(s, o, t, this.scale, {
          text: this.opts.textOf(o),
          dimText: this.opts.dimText,
          selected: this.selected?.id === o.id,
        });
      let e = this.points.map((o) => [o.x, o.y]),
        n = this.tool;
      if (e.length && A[n] !== void 0) {
        let o =
            this.cursor && n !== "count"
              ? [...e, [this.cursor.x, this.cursor.y]]
              : e,
          h = n === "line" ? "line" : n,
          a = { kind: h, points: o, color: this.color, h: 13 / this.scale },
          l = this.valueM(a);
        O(s, a, t, this.scale, {
          color: "#ffd84d",
          text:
            l !== null &&
            ["dist", "cont", "area", "arclen", "count"].includes(h)
              ? this.opts.fmt(h, l)
              : null,
          dimText: this.opts.dimText,
        });
        for (let d of e) {
          let c = t(d);
          (s.fillStyle = "#ffd84d"),
            s.beginPath(),
            s.arc(c.x, c.y, 4, 0, Math.PI * 2),
            s.fill();
        }
      }
      if (
        (this.stroke &&
          O(
            s,
            { kind: "sketch", points: this.stroke.map((o) => [o.x, o.y]) },
            t,
            this.scale,
            { color: E(this.color), width: 2.5 },
          ),
        this.box)
      ) {
        let [o, h] = this.box.map(t);
        this.tool === "zoomwin"
          ? (s.setLineDash([6, 4]),
            (s.strokeStyle = "#4cd6ff"),
            (s.lineWidth = 1.5),
            s.strokeRect(
              Math.min(o.x, h.x),
              Math.min(o.y, h.y),
              Math.abs(h.x - o.x),
              Math.abs(h.y - o.y),
            ),
            s.setLineDash([]))
          : O(
              s,
              { kind: "revcloud", points: this.box.map((a) => [a.x, a.y]) },
              t,
              this.scale,
              { color: E(this.color) },
            );
      }
      if (this.snapPt) snapMarker(s, this.snapPt, t);
      this.flashText &&
        R(
          s,
          this.toScreen(this.flashText.p),
          this.flashText.str.slice(0, 40),
          "#4cd6ff",
          { below: !0 },
        );
    }
  };
/** AutoCAD-style snap glyph plus its name. */
function snapMarker(s, sp, t) {
  let o = t(sp),
    x = o.x,
    y = o.y,
    k = sp.k ?? "end";
  s.save(), (s.strokeStyle = "#4cd6ff"), (s.lineWidth = 2), s.beginPath();
  if (k === "ext" && sp.from) {
    let f = t(sp.from);
    s.setLineDash([3, 4]), s.moveTo(f.x, f.y), s.lineTo(x, y), s.stroke(), s.setLineDash([]), s.beginPath();
  }
  switch (k) {
    case "mid": s.moveTo(x, y - 7), s.lineTo(x + 7, y + 5), s.lineTo(x - 7, y + 5), s.closePath(); break;
    case "cen": s.arc(x, y, 7, 0, Math.PI * 2); break;
    case "quad": s.moveTo(x, y - 7), s.lineTo(x + 7, y), s.lineTo(x, y + 7), s.lineTo(x - 7, y), s.closePath(); break;
    case "ins": s.rect(x - 6, y - 6, 12, 12), s.moveTo(x - 6, y), s.lineTo(x + 6, y); break;
    case "node": s.arc(x, y, 6, 0, Math.PI * 2), s.moveTo(x - 4, y - 4), s.lineTo(x + 4, y + 4), s.moveTo(x + 4, y - 4), s.lineTo(x - 4, y + 4); break;
    case "perp": s.moveTo(x - 7, y + 6), s.lineTo(x + 7, y + 6), s.moveTo(x - 7, y + 6), s.lineTo(x - 7, y - 7), s.moveTo(x - 7, y), s.lineTo(x, y), s.lineTo(x, y + 6); break;
    case "ext": s.moveTo(x - 6, y), s.lineTo(x + 6, y), s.moveTo(x, y - 6), s.lineTo(x, y + 6); break;
    case "near": s.moveTo(x - 6, y - 6), s.lineTo(x + 6, y - 6), s.lineTo(x - 6, y + 6), s.lineTo(x + 6, y + 6), s.closePath(); break;
    default: s.rect(x - 6, y - 6, 12, 12);
  }
  s.stroke(), (s.font = "600 11px Tajawal, sans-serif"), (s.fillStyle = "#4cd6ff"), (s.textAlign = "left"), s.fillText(SNAP_AR[k] ?? "", x + 10, y - 10), s.restore();
}
export { SNAP_KINDS, SNAP_AR };
/** MTEXT lines, word-wrapped to the box width once (in text-height units). */
function textLines(ctx, t) {
  if (t._lines) return t._lines;
  let lines = t.str.split("\n");
  if (t.w > 0 && t.h > 0) {
    let f = ctx.font;
    ctx.font = '100px "Segoe UI", Tahoma, sans-serif';
    let max = (t.w / t.h) * 100 * 1.02,
      out = [];
    for (let l of lines) {
      let cur = "";
      for (let word of l.split(" ")) {
        let next = cur ? cur + " " + word : word;
        cur && ctx.measureText(next).width > max ? (out.push(cur), (cur = word)) : (cur = next);
      }
      out.push(cur);
    }
    (ctx.font = f), (lines = out);
  }
  return (t._lines = lines);
}
function Q(i) {
  i.size = 0;
  for (let t of Object.values(i.layers)) {
    // One path per color + lineweight.
    let e = new Map();
    for (let n of t.lines) {
      i.size += n.pts.length;
      let key = n.color * 256 + Math.min(255, n.lw | 0),
        o = e.get(key);
      o || e.set(key, (o = { color: n.color, lw: n.lw | 0, path: new Path2D() })),
        o.path.moveTo(n.pts[0].x, n.pts[0].y);
      for (let h = 1; h < n.pts.length; h++) o.path.lineTo(n.pts[h].x, n.pts[h].y);
    }
    (t.paths = [...e.values()]),
      (t.fillPaths = t.fills.map((n) => {
        let o = new Path2D();
        for (let h of n.loops) {
          o.moveTo(h[0].x, h[0].y);
          for (let a = 1; a < h.length; a++) o.lineTo(h[a].x, h[a].y);
          o.closePath();
        }
        return { color: n.color, alpha: n.alpha, path: o };
      })),
      (t.lines = null);
  }
  let s = i.view;
  (i.cell = Math.max(s.maxX - s.minX, s.maxY - s.minY) / 300 || 1),
    (i.snapGrid = new Map());
  for (let t of i.snaps) {
    let e = Math.floor(t.x / i.cell) + "," + Math.floor(t.y / i.cell),
      n = i.snapGrid.get(e);
    n || i.snapGrid.set(e, (n = [])), n.push(t);
  }
  return (i.segIndex = new F(i.segs, i.cell * 4)), i;
}
var F = class {
  constructor(s, t) {
    (this.cell = t), (this.map = new Map());
    let e = s.length / 6;
    for (let n = 0; n < e; n++) {
      let o = n * 6,
        h = Math.floor(Math.min(s[o], s[o + 2]) / t),
        a = Math.floor(Math.max(s[o], s[o + 2]) / t),
        l = Math.floor(Math.min(s[o + 1], s[o + 3]) / t),
        d = Math.floor(Math.max(s[o + 1], s[o + 3]) / t);
      if ((a - h + 1) * (d - l + 1) > 400) {
        (this.big ??= []).push(n);
        continue;
      }
      for (let c = h; c <= a; c++)
        for (let p = l; p <= d; p++) {
          let m = c + "," + p,
            b = this.map.get(m);
          b || this.map.set(m, (b = [])), b.push(n);
        }
    }
  }
  *query(s, t, e, n) {
    let o = this.cell,
      h = new Set();
    for (let a = Math.floor(s / o); a <= Math.floor(e / o); a++)
      for (let l = Math.floor(t / o); l <= Math.floor(n / o); l++)
        for (let d of this.map.get(a + "," + l) ?? [])
          h.has(d) || (h.add(d), yield d);
    yield* this.big ?? [];
  }
};
function it(i) {
  if (i.limits) {
    let [t, e] = i.limits;
    if (e.x - t.x > 0 && e.y - t.y > 0)
      return { minX: t.x, minY: t.y, maxX: e.x, maxY: e.y };
  }
  let s = { ...i.flat.bbox };
  for (let t of i.viewports)
    (s.minX = Math.min(s.minX, t.c.x - t.w / 2)),
      (s.maxX = Math.max(s.maxX, t.c.x + t.w / 2)),
      (s.minY = Math.min(s.minY, t.c.y - t.h / 2)),
      (s.maxY = Math.max(s.maxY, t.c.y + t.h / 2));
  return s;
}
function et(i, s) {
  let t = [i[0]];
  for (let e of i.slice(1)) {
    let n = t[t.length - 1];
    Math.hypot(e.x - n.x, e.y - n.y) >= s && t.push(e);
  }
  return t.length === 1 && t.push(i[i.length - 1]), t;
}
export { K as CadView };
