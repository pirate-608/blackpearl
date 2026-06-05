#!/usr/bin/env node
// Generate ASCII art from the blackpearl SVG logo.
// Usage: node scripts/generate-ascii-logo.mjs

import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { Resvg } = require("@resvg/resvg-js");
const asciify = require("asciify-image");

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, "..");
const SVG_PATH = join(ROOT, "docs", "assets", "images", "blackpearl.svg");
const PNG_OUT = join(SCRIPT_DIR, ".temp-logo.png");

// Step 1: Render SVG to PNG at a suitable width for terminal display
const svgBuffer = readFileSync(SVG_PATH);
const resvg = new Resvg(svgBuffer.toString("utf8"), {
  fitTo: { mode: "width", value: 80 },
  background: "#00000000",
});
const pngBuffer = resvg.render();
const pngData = pngBuffer.asPng();
writeFileSync(PNG_OUT, pngData);
process.stderr.write(`Rendered PNG (${pngData.length} bytes)\n`);

// Step 2: Convert PNG to ASCII
asciify(PNG_OUT, { fit: "box", width: 50, height: 16, color: false }, (err, result) => {
  if (err) {
    process.stderr.write(`asciify error: ${err.message}\n`);
    process.exit(1);
  }
  process.stdout.write(result);
});
