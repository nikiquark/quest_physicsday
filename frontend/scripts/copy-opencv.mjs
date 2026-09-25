// Copies OpenCV.js from node_modules into public/ so it is served from our own domain.
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/@techstark/opencv-js/dist/opencv.js");
const dst = join(root, "public/opencv/opencv.js");

mkdirSync(dirname(dst), { recursive: true });
if (!existsSync(dst) || statSync(dst).size !== statSync(src).size) {
  copyFileSync(src, dst);
  console.log("opencv.js copied to public/opencv/");
}
