import { z } from "zod";
import { createToolDefinition } from "./registry.js";

const API_URL =
  "http://baike.baidu.com/api/openapi/BaikeLemmaCardApi?scope=103&format=json&appid=379020&bk_length=600";

const schema = z.object({
  keyword: z.string().min(1).describe("The Chinese keyword to search on Baidu Baike."),
});

type BaiduApiResponse = {
  id?: number;
  key?: string;
  card?: Array<{
    name?: string;
    value?: string;
    format?: string[];
  }>;
  image?: string;
  abstract?: string;
  url?: string;
  sub_lemma?: Array<{
    key_name?: string;
    name?: string;
    sub_lemma_id?: string;
  }>;
  errno?: string;
};

export const baiduSearchTool = createToolDefinition({
  name: "baidu_search",
  description:
    "Search Baidu Baike (百度百科) for Chinese encyclopedia entries. " +
    "Use this tool when you need Chinese-language factual information, " +
    "definitions, or background knowledge about a topic.",
  schema,
  async execute(input) {
    const keyword = encodeURIComponent(input.keyword.trim());
    const url = `${API_URL}&bk_key=${keyword}`;

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "blackpearl-agent-course-demo/0.1",
      },
    });

    if (!response.ok) {
      return {
        keyword: input.keyword,
        found: false,
        status: response.status,
        message: `Baidu Baike returned HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as BaiduApiResponse;

    if (data.errno && data.errno !== "0") {
      return {
        keyword: input.keyword,
        found: false,
        errno: data.errno,
        message: `Baidu Baike error code: ${data.errno}`,
      };
    }

    // Extract text from card fields
    const cardFields: Record<string, string> = {};
    if (data.card) {
      for (const item of data.card) {
        if (item.name && item.value) {
          cardFields[item.name] = item.value;
        }
      }
    }

    return {
      keyword: input.keyword,
      found: true,
      title: data.key ?? input.keyword,
      abstract: data.abstract ?? "",
      url: data.url ?? `https://baike.baidu.com/item/${keyword}`,
      cardFields,
      image: data.image ?? undefined,
      subLemmas:
        data.sub_lemma?.map((s) => ({ name: s.key_name ?? s.name, id: s.sub_lemma_id })) ?? [],
    };
  },
});
