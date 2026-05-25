import OpenAI, { type ClientOptions } from "openai";
import type { AppConfig } from "../shared/config.js";

export function createOpenAIClient(config: AppConfig): OpenAI {
  const options: ClientOptions = {};

  if (config.apiKey) {
    options.apiKey = config.apiKey;
  }

  if (config.baseUrl) {
    options.baseURL = config.baseUrl;
  }

  return new OpenAI(options);
}
