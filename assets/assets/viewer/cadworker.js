// Reads a DWG/DXF off the main thread so the page stays responsive.
import { readDrawing } from './cadread.js';

self.onmessage = async ({ data }) => {
  const post = (m) => self.postMessage(m);
  try {
    const doc = await readDrawing(new Uint8Array(data.bytes), data.kind, (stage, f) => post({ type: 'progress', stage, f }));
    post({ type: 'done', doc });
  } catch (e) {
    post({ type: 'error', code: e.code ?? 'read', message: String(e.message ?? e) });
  }
};
self.postMessage({ type: 'ready' });
