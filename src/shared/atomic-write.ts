import {mkdir, rename, unlink, writeFile} from "node:fs/promises";
import {dirname} from "node:path";

export const atomicWriteJson = async (
  targetPath: string,
  data: unknown,
): Promise<void> => {
  const temporaryPath = `${targetPath}.tmp`;

  try {
    await mkdir(dirname(targetPath), {recursive: true});
    await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await rename(temporaryPath, targetPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw new Error(`原子写入失败：${targetPath}`, {cause: error});
  }
};
