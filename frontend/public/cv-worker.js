/* ArUco detection worker (classic worker so it can importScripts opencv.js). */
/* global cv */
let detector = null;
let loading = null;

// opencv.js is ~13 MB uncompressed; used when Content-Length is missing or gzipped.
const EXPECTED_SIZE = 13_300_000;

async function load(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`opencv.js: HTTP ${response.status}`);
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  let lastReport = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    const progress = Math.min(0.99, received / EXPECTED_SIZE);
    if (progress - lastReport > 0.02) {
      lastReport = progress;
      self.postMessage({ type: "progress", progress });
    }
  }
  const blobUrl = URL.createObjectURL(new Blob(chunks, { type: "text/javascript" }));
  importScripts(blobUrl);
  URL.revokeObjectURL(blobUrl);

  let lib = self.cv;
  if (lib && typeof lib.then === "function") lib = await lib;
  else if (lib && !lib.Mat) await new Promise((resolve) => (lib.onRuntimeInitialized = resolve));
  self.cv = lib;

  const dictionary = lib.getPredefinedDictionary(lib.DICT_5X5_1000);
  const params = new lib.aruco_DetectorParameters();
  params.cornerRefinementMethod = 0; // none: we only need ids and rough corners
  const refine = new lib.aruco_RefineParameters(10, 3, true);
  detector = new lib.aruco_ArucoDetector(dictionary, params, refine);
}

function detect({ width, height, buffer }) {
  const lib = self.cv;
  const rgba = lib.matFromImageData({ data: new Uint8ClampedArray(buffer), width, height });
  const gray = new lib.Mat();
  const corners = new lib.MatVector();
  const ids = new lib.Mat();
  const rejected = new lib.MatVector();
  try {
    lib.cvtColor(rgba, gray, lib.COLOR_RGBA2GRAY);
    detector.detectMarkers(gray, corners, ids, rejected);
    const markers = [];
    const idList = ids.data32S;
    for (let i = 0; i < idList.length; i++) {
      markers.push({ id: idList[i], corners: Array.from(corners.get(i).data32F) });
    }
    return markers;
  } finally {
    rgba.delete();
    gray.delete();
    corners.delete();
    ids.delete();
    rejected.delete();
  }
}

self.onmessage = async (event) => {
  const msg = event.data;
  if (msg.type === "load") {
    try {
      loading = loading || load(msg.url);
      await loading;
      self.postMessage({ type: "ready" });
    } catch (err) {
      loading = null;
      self.postMessage({ type: "error", error: String(err) });
    }
  } else if (msg.type === "detect") {
    let markers = [];
    try {
      if (detector) markers = detect(msg);
    } catch (err) {
      self.postMessage({ type: "error", error: String(err) });
    }
    // Hand the pixel buffer back so the main thread can reuse it.
    self.postMessage({ type: "result", seq: msg.seq, markers, buffer: msg.buffer }, [msg.buffer]);
  }
};
