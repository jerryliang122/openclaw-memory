// Types-only host install: fetches the openclaw tarball via `npm pack`
// (no dependency resolution, no lifecycle scripts, ~65 MB) and unpacks it
// into node_modules/openclaw so tsc can typecheck against the real SDK.
// A full `npm install openclaw` pulls a ~200 MB dependency tree and has
// OOM'd this machine before — do not "fix" this script into one.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = pkg.openclaw?.build?.openclawVersion;
if (typeof version !== "string") {
  throw new Error("package.json openclaw.build.openclawVersion is missing");
}

const target = join(root, "node_modules", "openclaw");
if (existsSync(join(target, "dist", "plugin-sdk", "plugin-entry.d.ts"))) {
  console.log(`host types already present (openclaw@${version}), nothing to do`);
  process.exit(0);
}

const tgz = execFileSync("npm", ["pack", `openclaw@${version}`, "--silent"], {
  cwd: tmpdir(),
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .pop();

mkdirSync(target, { recursive: true });
execFileSync("tar", [
  "xzf",
  join(tmpdir(), tgz),
  "-C",
  target,
  "--strip-components=1",
]);
console.log(`installed types-only openclaw@${version} into node_modules/openclaw`);
