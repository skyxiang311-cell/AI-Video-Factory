import {readFile} from "node:fs/promises";
import {z} from "zod";
import {atomicWriteJson} from "../../shared/atomic-write";

export const writeValidatedJson = async <T>(
  targetPath: string,
  schema: z.ZodType<T>,
  data: unknown,
): Promise<T> => {
  const validated = schema.parse(data);

  await atomicWriteJson(targetPath, validated);
  return validated;
};

export const readValidatedJson = async <T>(
  targetPath: string,
  schema: z.ZodType<T>,
): Promise<T> => {
  const content = await readFile(targetPath, "utf8");
  return schema.parse(JSON.parse(content));
};
