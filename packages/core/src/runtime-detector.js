import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function resolveExecutable(command, pathValue = process.env.PATH ?? "") {
  for (const directory of pathValue.split(delimiter).filter(Boolean)) {
    const candidate = join(directory, command);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue searching PATH.
    }
  }
  return null;
}

export async function detectRuntimes(runtimes, options = {}) {
  const pathValue = options.pathValue ?? process.env.PATH;
  const timeout = options.timeout ?? 1500;
  return Promise.all(runtimes.map(async (runtime) => {
    if (runtime.builtin) return { runtimeId: runtime.id, installed: true, managed: true, version: runtime.version };
    const executable = await resolveExecutable(runtime.command, pathValue);
    if (!executable) return { runtimeId: runtime.id, installed: false, version: null };

    try {
      const { stdout, stderr } = await execFileAsync(executable, runtime.versionArgs, {
        timeout,
        windowsHide: true,
        maxBuffer: 64 * 1024,
      });
      const version = `${stdout}${stderr}`.trim().split(/\r?\n/, 1)[0].slice(0, 200) || "unknown";
      return { runtimeId: runtime.id, installed: true, version };
    } catch (error) {
      return { runtimeId: runtime.id, installed: true, version: null, diagnostic: error.code === "ETIMEDOUT" ? "version check timed out" : "version check failed" };
    }
  }));
}
