import OpenAI, { type ClientOptions } from "openai";
import type { AppConfig } from "../shared/config.js";

export function createOpenAIClient(config: AppConfig): OpenAI {
  const options: ClientOptions = {};

  if (config.openaiApiKey) {
    options.apiKey = config.openaiApiKey;
  }

  if (config.openaiBaseUrl) {
    options.baseURL = config.openaiBaseUrl;
  }

  return new OpenAI(options);
}
