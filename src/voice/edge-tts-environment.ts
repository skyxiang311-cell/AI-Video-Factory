import {spawn} from "node:child_process";
import {access} from "node:fs/promises";
import {resolve} from "node:path";

const run = (executable: string, args: string[], stdio: "ignore" | "inherit" = "inherit") =>
  new Promise<void>((resolveProcess, reject) => {
    const child = spawn(executable, args, {stdio});
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolveProcess()
        : reject(new Error(`${executable} exited with code ${String(code)}`)),
    );
  });

export const ensureEdgeTtsEnvironment = async (): Promise<string> => {
  const virtualEnvironment = resolve(".venv");
  const pythonPath = resolve(virtualEnvironment, "bin/python");
  try {
    await access(pythonPath);
  } catch {
    console.log("正在创建本地 Python 虚拟环境 .venv …");
    await run("python3", ["-m", "venv", virtualEnvironment]);
  }

  try {
    await run(
      pythonPath,
      ["-c", "import edge_tts; assert edge_tts.__version__ == '7.2.8'"],
      "ignore",
    );
  } catch {
    console.log("正在安装锁定版本 edge-tts==7.2.8 …");
    await run(pythonPath, ["-m", "pip", "install", "-r", resolve("requirements-voice.txt")]);
  }
  return pythonPath;
};
