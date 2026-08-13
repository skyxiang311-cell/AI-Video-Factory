import {z} from "zod";

export type OllamaFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export const toOllamaSchema = (schema: z.ZodType): Record<string, unknown> => {
  const generated = z.toJSONSchema(schema, {target: "draft-7"});
  const {$schema: _declaration, ...result} = generated;
  const normalize = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(normalize);
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.pattern === "string") record.pattern = record.pattern.replaceAll("\\d", "[0-9]");
    Object.values(record).forEach(normalize);
  };
  normalize(result);
  return result;
};

interface OllamaChunk {message?: {content?: string}; error?: string}

export const readOllamaResponse = async (response: Response): Promise<{content: string; error?: string}> => {
  if (!response.body) return {content: ""};
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let content = "";
  let error: string | undefined;
  const consume = (line: string): void => {
    if (!line.trim()) return;
    const chunk = JSON.parse(line) as OllamaChunk;
    content += chunk.message?.content ?? "";
    error ??= chunk.error;
  };
  while (true) {
    const {done, value} = await reader.read();
    pending += decoder.decode(value, {stream: !done});
    let newline = pending.indexOf("\n");
    while (newline !== -1) {
      consume(pending.slice(0, newline));
      pending = pending.slice(newline + 1);
      newline = pending.indexOf("\n");
    }
    if (done) break;
  }
  consume(pending);
  return {content, error};
};
