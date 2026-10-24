// Reads DWG/DXF bytes into the viewer's drawing model (used by the worker,
// and on the main thread when module workers are unavailable).
import { parseDxf } from "./dxf.js";

export async function readDrawing(bytes, kind, progress = () => {}) {
  let dxf = bytes;
  if (kind === "dwg") {
    progress("dwg", 0);
    dxf = await dwgToDxf(bytes);
    bytes = null;
  }
  progress("parse", 0);
  return parseDxf(dxf, (f) => progress("parse", f));
}

// Versions LibreDWG reads (R13 .. 2018 format, which AutoCAD 2018-2026 still save).
const DWG_VERSIONS = {
  AC1012: "R13",
  AC1014: "R14",
  AC1015: "2000",
  AC1018: "2004",
  AC1021: "2007",
  AC1024: "2010",
  AC1027: "2013",
  AC1032: "2018",
};

function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

async function dwgToDxf(bytes) {
  const sig = new TextDecoder("latin1").decode(bytes.subarray(0, 6));
  if (!/^AC10\d\d$/.test(sig))
    throw fail(
      "notdwg",
      "Not a DWG file: " + sig.replace(/[^\x20-\x7e]/g, "?"),
    );
  if (!DWG_VERSIONS[sig]) throw fail("version", sig);
  const { default: createModule } = await import("./libredwg-glue.js");
  const quiet = () => {};
  const m = await createModule({
    locateFile: (f) => new URL(f, import.meta.url).href,
    print: quiet,
    printErr: quiet,
  });
  m.FS.writeFile("/in.dwg", bytes);
  let rc;
  try {
    rc = m.dwg_write_dxf("/in.dwg", "/out.dxf");
  } catch (e) {
    throw fail("crash", "LibreDWG: " + (e.message ?? e));
  }
  // Codes below 128 are warnings; the DXF is still written.
  if (!m.FS.analyzePath("/out.dxf").exists)
    throw fail("read", "LibreDWG error " + rc);
  const out = m.FS.readFile("/out.dxf");
  if (!out.length) throw fail("read", "LibreDWG error " + rc);
  return out;
}
