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
    "CRITICAL: use a short, EXACT lemma name as the keyword (e.g. '迈克尔·杰克逊', " +
    "not '迈克尔杰克逊 出生年份 死亡年份'). Multi-word queries will return no results. " +
    "Use this tool as the primary search for Chinese-language factual queries.",
  schema,
  async execute(input) {
    const keyword = encodeURIComponent(input.keyword.trim());
    const url = `${API_URL}&bk_key=${keyword}`;

    try {
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
        const hints: Record<string, string> = {
          "2": "Keyword not matched — use a shorter, exact lemma name (e.g. remove extra words like '出生年份' or '生平信息')",
        };
        return {
          keyword: input.keyword,
          found: false,
          errno: data.errno,
          message: hints[data.errno] ?? `Baidu Baike error code: ${data.errno}`,
        };
      }

      // Extract text from card fields (strip HTML tags)
      const cardFields: Record<string, string> = {};
      if (data.card) {
        for (const item of data.card) {
          if (item.name && item.value) {
            const clean = stripHtml(String(item.value));
            cardFields[item.name] = clean;
          }
        }
      }

      // Build a text summary from card fields if abstract is empty
      let abstract = stripHtml(data.abstract ?? "");
      if (!abstract && Object.keys(cardFields).length > 0) {
        const topFields = Object.entries(cardFields)
          .slice(0, 8)
          .map(([k, v]) => `${k}: ${v}`);
        abstract = topFields.join("；");
      }

      return {
        keyword: input.keyword,
        found: true,
        title: data.key ?? input.keyword,
        abstract,
        url: data.url ?? `https://baike.baidu.com/item/${keyword}`,
        cardFields,
        image: data.image ?? undefined,
        subLemmas:
          data.sub_lemma?.map((s) => ({ name: s.key_name ?? s.name, id: s.sub_lemma_id })) ?? [],
      };
    } catch (error) {
      return {
        keyword: input.keyword,
        found: false,
        error: `Network error: ${error instanceof Error ? error.message : String(error)}`,
        message: "Baidu Baike request failed. Try again with a simpler keyword.",
      };
    }
  },
});

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}
