import Fuse from "fuse.js";
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

// In-memory cache of successfully found keywords for fuzzy fallback
const knownLemmas: string[] = [];
const fuseIndex = new Fuse(knownLemmas, {
  threshold: 0.4,
  includeScore: true,
  minMatchCharLength: 2,
});

// ── Keyword cleanup ──────────────────────────────

// Words commonly appended to search queries that should be stripped
// when looking for an exact Baidu Baike lemma.
const NOISE_PATTERNS = [
  /\s+/g,
  /[（(][^)）]*[)）]/g,
  /(出生|逝世|死亡)?年份/g,
  /(出生|逝世|死亡)?日期/g,
  /(生平|简介|经历|成就|作品|代表作|获奖|国籍|职业|身高|体重)(信息|介绍)?/g,
  /(什么|怎么|如何|为什么|哪个|哪里|是谁|多大|多少)/g,
  /(公司|企业|集团)$/,
  /^(关于|有关)/,
  /的.*$/,
];

function extractCoreKeyword(raw: string): string {
  let cleaned = raw.trim();

  for (const pattern of NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }

  // If nothing left, keep the original
  cleaned = cleaned.trim();
  if (!cleaned) return raw.trim();

  // Limit to 10 characters as Baidu lemmas are rarely longer
  if (cleaned.length > 10) {
    cleaned = cleaned.slice(0, 10);
  }

  return cleaned;
}

// Generate fuzzy variants by inserting/removing middle dots
// that are common in Chinese translated names
function generateVariants(keyword: string): string[] {
  const variants: string[] = [keyword];

  // Try without spaces
  const noSpace = keyword.replace(/\s+/g, "");
  if (noSpace !== keyword) variants.push(noSpace);

  // Try with middle dot for common two-part names (e.g. 迈克尔杰克逊 → 迈克尔·杰克逊)
  if (!keyword.includes("·") && keyword.length >= 4) {
    // Insert middle dot after each 2-3 character boundary
    for (let i = 2; i <= Math.min(4, keyword.length - 2); i++) {
      const withDot = keyword.slice(0, i) + "·" + keyword.slice(i);
      if (withDot !== keyword) variants.push(withDot);
    }
  }

  // Try without middle dot
  if (keyword.includes("·")) {
    variants.push(keyword.replace(/·/g, ""));
    variants.push(keyword.replace(/·/g, " "));
  }

  return variants;
}

// ── API fetch ─────────────────────────────────────

async function fetchBaiduApi(keyword: string): Promise<BaiduApiResponse> {
  const url = `${API_URL}&bk_key=${encodeURIComponent(keyword)}`;
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "blackpearl-agent-course-demo/0.1",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as BaiduApiResponse;
}

// ── Tool ──────────────────────────────────────────

export const baiduSearchTool = createToolDefinition({
  name: "baidu_search",
  description:
    "Search Baidu Baike (百度百科) for Chinese encyclopedia entries. " +
    "CRITICAL: use a short, EXACT lemma name as the keyword (e.g. '迈克尔·杰克逊', " +
    "not '迈克尔杰克逊 出生年份 死亡年份'). The tool automatically tries " +
    "fuzzy variants if the exact keyword fails. " +
    "Use this tool as the primary search for Chinese-language factual queries.",
  schema,
  async execute(input) {
    const rawKeyword = input.keyword.trim();

    try {
      // First attempt: use the keyword as-is
      let data = await fetchBaiduApi(rawKeyword);

      // If not found, try cleaned + variant keywords
      if (data.errno && data.errno !== "0") {
        const coreKeyword = extractCoreKeyword(rawKeyword);
        const variants = generateVariants(coreKeyword);

        // Also check fuse.js cache for similar known lemmas
        const fuseResults = fuseIndex.search(rawKeyword).slice(0, 3);
        const fuseKeywords = fuseResults.map((r) => r.item);
        const allCandidates = [...new Set([...variants, ...fuseKeywords])];

        // Try each candidate (skip the original if already tried)
        let tried = 0;
        for (const candidate of allCandidates) {
          if (candidate === rawKeyword) continue;
          if (tried >= 4) break; // Max 4 retries

          data = await fetchBaiduApi(candidate);
          if (!data.errno || data.errno === "0") {
            // Found! Cache this keyword for future fuzzy searches
            if (!knownLemmas.includes(candidate)) {
              knownLemmas.push(candidate);
              fuseIndex.setCollection(knownLemmas);
            }
            break;
          }
          tried++;
        }
      }

      // Still failed after retries
      if (data.errno && data.errno !== "0") {
        const coreKeyword = extractCoreKeyword(rawKeyword);
        const hints: Record<string, string> = {
          "2": `Keyword not matched — tried "${rawKeyword}"${coreKeyword !== rawKeyword ? ` and "${coreKeyword}"` : ""}. Use a simpler, exact lemma name without extra words.`,
        };
        return {
          keyword: rawKeyword,
          found: false,
          errno: data.errno,
          message: hints[data.errno] ?? `Baidu Baike error code: ${data.errno}`,
        };
      }

      // Cache successful keyword
      if (!knownLemmas.includes(rawKeyword)) {
        knownLemmas.push(rawKeyword);
        fuseIndex.setCollection(knownLemmas);
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
        keyword: rawKeyword,
        found: true,
        title: data.key ?? rawKeyword,
        abstract,
        url: data.url ?? `https://baike.baidu.com/item/${encodeURIComponent(rawKeyword)}`,
        cardFields,
        image: data.image ?? undefined,
        subLemmas:
          data.sub_lemma?.map((s) => ({ name: s.key_name ?? s.name, id: s.sub_lemma_id })) ?? [],
      };
    } catch (error) {
      return {
        keyword: rawKeyword,
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
