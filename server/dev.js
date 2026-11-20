import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;

const api = spawn(node, ["server/index.ts"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, PORT: process.env.PORT || "8787" },
});

const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
const web = spawn(node, [viteBin, "--host", "127.0.0.1"], {
  cwd: root,
  stdio: "inherit",
});

function stop() {
  api.kill();
  web.kill();
}

process.on("SIGINT", () => {
  stop();
  process.exit(0);
});
process.on("SIGTERM", stop);
web.on("exit", (code) => {
  api.kill();
  process.exit(code ?? 0);
});
