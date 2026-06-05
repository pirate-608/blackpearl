#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import * as esbuild from "esbuild";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, "..");
const DIST_DIR = join(ROOT_DIR, "dist-sea");
const BUNDLE_PATH = join(DIST_DIR, "blackpearl.bundle.mjs");
const SEA_CONFIG_PATH = join(DIST_DIR, "sea-config.json");
const OUTPUT_BINARY_PATH = join(DIST_DIR, getBinaryName());
const ICON_PATH = join(ROOT_DIR, "docs", "assets", "images", "blackpearl.ico");
const NODE_MINIMUM = { major: 25, minor: 5, patch: 0 };

const command = process.argv[2] ?? "sea";

if (!["bundle", "sea", "smoke"].includes(command)) {
  fail(`Unknown packaging command: ${command}. Use bundle, sea, or smoke.`);
}

if (command === "bundle") {
  await buildBundle();
} else if (command === "sea") {
  assertSeaCompatibleNode();
  await buildBundle();
  await buildSeaExecutable();
} else {
  await smokeTest();
}

async function buildBundle() {
  await mkdir(DIST_DIR, { recursive: true });

  // Read version from package.json for injection into the bundle
  const pkgPath = join(ROOT_DIR, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));

  await esbuild.build({
    entryPoints: [join(ROOT_DIR, "src", "cli.ts")],
    outfile: BUNDLE_PATH,
    bundle: true,
    platform: "node",
    format: "esm",
    splitting: false,
    target: "node26",
    logLevel: "info",
    sourcemap: false,
    external: ["pdf-parse"],
    define: {
      "globalThis.__BLACKPEARL_VERSION__": JSON.stringify(pkg.version),
    },
    plugins: [optionalReactDevtoolsStub()],
  });

  // Inject require polyfill via top-level await import to avoid naming
  // conflicts with any static import of createRequire in the bundle.
  // Must be placed after the shebang line (if present) so the shebang stays first.
  let bundle = await readFile(BUNDLE_PATH, "utf8");
  const polyfill = "var require=(await import(\"node:module\")).createRequire(import.meta.url);";
  if (bundle.startsWith("#!/")) {
    const nl = bundle.indexOf("\n");
    bundle = bundle.slice(0, nl + 1) + polyfill + "\n" + bundle.slice(nl + 1);
  } else {
    bundle = polyfill + "\n" + bundle;
  }
  await writeFile(BUNDLE_PATH, bundle, "utf8");

  console.log(`Created ESM bundle: ${relative(BUNDLE_PATH)}`);
}

function optionalReactDevtoolsStub() {
  return {
    name: "optional-react-devtools-stub",
    setup(build) {
      build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
        path: "react-devtools-core",
        namespace: "blackpearl-stub",
      }));

      build.onLoad({ filter: /.*/, namespace: "blackpearl-stub" }, () => ({
        contents:
          "export default { connectToDevTools() { return undefined; } };",
        loader: "js",
      }));
    },
  };
}

async function buildSeaExecutable() {
  const seaConfig = {
    main: BUNDLE_PATH,
    output: OUTPUT_BINARY_PATH,
    mainFormat: "module",
    useCodeCache: false,
    useSnapshot: false,
    execArgv: ["--no-warnings"],
    disableExperimentalSEAWarning: true,
  };
  await writeFile(SEA_CONFIG_PATH, `${JSON.stringify(seaConfig, null, 2)}\n`, "utf8");
  console.log(`Created SEA config: ${relative(SEA_CONFIG_PATH)}`);

  await run(process.execPath, ["--build-sea", SEA_CONFIG_PATH]);

  if (process.platform === "win32") {
    await embedIcon();
  } else {
    await chmod(OUTPUT_BINARY_PATH, 0o755);
  }

  console.log(`Created SEA executable: ${relative(OUTPUT_BINARY_PATH)}`);
}

async function embedIcon() {
  try {
    const require = createRequire(import.meta.url);
    const rcedit = require("rcedit");
    await rcedit(OUTPUT_BINARY_PATH, { icon: ICON_PATH });
    console.log(`Embedded icon: ${relative(ICON_PATH)}`);
  } catch (error) {
    console.warn(
      `Could not embed icon (non-fatal): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function smokeTest() {
  await run("node", [BUNDLE_PATH, "--help"]);

  if (await exists(OUTPUT_BINARY_PATH)) {
    await run(OUTPUT_BINARY_PATH, ["--help"]);
  } else {
    console.log(`Skipping binary smoke test because ${relative(OUTPUT_BINARY_PATH)} does not exist.`);
    console.log("Run corepack pnpm package:sea with Node 26+ to create it.");
  }
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function run(file, args) {
  console.log(`> ${[file, ...args].join(" ")}`);

  try {
    const { stdout, stderr } = await execFileAsync(file, args, {
      cwd: ROOT_DIR,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 10,
    });

    if (stdout) {
      process.stdout.write(stdout);
    }

    if (stderr) {
      process.stderr.write(stderr);
    }
  } catch (error) {
    const failed = error;

    if (failed?.stdout) {
      process.stdout.write(failed.stdout);
    }

    if (failed?.stderr) {
      process.stderr.write(failed.stderr);
    }

    fail(`Command failed: ${[file, ...args].join(" ")}`);
  }
}

function assertSeaCompatibleNode() {
  const current = parseNodeVersion(process.versions.node);

  if (compareVersions(current, NODE_MINIMUM) >= 0) {
    return;
  }

  fail(
    `Node ${process.versions.node} cannot build an ESM SEA executable. ` +
      "Install Node 26 or newer, then rerun: corepack pnpm package:sea",
  );
}

function parseNodeVersion(value) {
  const [major, minor, patch] = value.split(".").map((part) => Number.parseInt(part, 10));
  return {
    major: Number.isFinite(major) ? major : 0,
    minor: Number.isFinite(minor) ? minor : 0,
    patch: Number.isFinite(patch) ? patch : 0,
  };
}

function compareVersions(left, right) {
  if (left.major !== right.major) {
    return left.major - right.major;
  }

  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }

  return left.patch - right.patch;
}

function relative(path) {
  return path.replace(`${ROOT_DIR}\\`, "").replace(`${ROOT_DIR}/`, "");
}

function getBinaryName() {
  const extension = process.platform === "win32" ? ".exe" : "";
  return `blackpearl-${process.platform}-${process.arch}${extension}`;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
