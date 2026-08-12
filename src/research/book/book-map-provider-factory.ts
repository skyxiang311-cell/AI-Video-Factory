import type {BookMapProvider} from "./book-map-provider";
import {createOllamaBookMapProviderFromEnv} from "./ollama-book-map-provider";

interface CreateDefaultProviderOptions {
  env?: Record<string, string | undefined>;
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

export const createDefaultBookMapProviderFromEnv = (
  options: CreateDefaultProviderOptions = {},
): BookMapProvider => createOllamaBookMapProviderFromEnv(options);
