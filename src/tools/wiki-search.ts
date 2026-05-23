import { z } from "zod";
import { createToolDefinition } from "./registry.js";

const schema = z.object({
  query: z.string().min(1).describe("The topic to search on Wikipedia."),
  lang: z
    .string()
    .regex(/^[a-z-]{2,12}$/i)
    .default("en")
    .describe("Wikipedia language code, such as en or zh."),
});

type WikipediaSummary = {
  title?: string;
  extract?: string;
  content_urls?: {
    desktop?: {
      page?: string;
    };
  };
};

export const wikiSearchTool = createToolDefinition({
  name: "wiki_search",
  description: "Fetch a short Wikipedia summary for a topic.",
  schema,
  async execute(input) {
    const language = input.lang.toLowerCase();
    const title = encodeURIComponent(input.query.trim().replaceAll(" ", "_"));
    const url = `https://${language}.wikipedia.org/api/rest_v1/page/summary/${title}`;
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "blackpearl-agent-course-demo/0.1",
      },
    });

    if (!response.ok) {
      return {
        query: input.query,
        found: false,
        status: response.status,
        message: `Wikipedia returned ${response.status}`,
      };
    }

    const data = (await response.json()) as WikipediaSummary;

    return {
      query: input.query,
      found: true,
      title: data.title ?? input.query,
      summary: data.extract ?? "",
      url: data.content_urls?.desktop?.page ?? url,
    };
  },
});
