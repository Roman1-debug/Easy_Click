const { spawn } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const isWindows = process.platform === "win32";

function run(command, args, label) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: isWindows,
    windowsHide: false,
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    shutdown(code ?? (signal ? 1 : 0));
  });

  return child;
}

function stopDevProcesses() {
  return new Promise((resolve, reject) => {
    const script = path.join(root, "scripts", "stop-dev-ports.ps1");
    const stopper = spawn(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
      { cwd: root, stdio: "inherit", shell: isWindows, windowsHide: false }
    );

    stopper.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`stop-dev-ports failed with code ${code}`));
    });
  });
}

let shuttingDown = false;
let backend;
let frontend;

function shutdown(exitCode = 0) {
  for (const child of [backend, frontend]) {
    if (child && !child.killed) {
      try {
        child.kill("SIGTERM");
      } catch {}
    }
  }
  process.exit(exitCode);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

(async () => {
  await stopDevProcesses();
  backend = run("python", ["run_server.py"], "backend");
  frontend = run("npx", ["next", "dev"], "frontend");
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
