import { normalizeResults } from "./index.js";

function decodeHTMLEntities(text) {
  if (!text) return "";
  return text
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#x2F;/g, "/")
    .replace(/&#39;/g, "'").replace(/<[^>]*>/g, "");
}

/**
 * 从 DuckDuckGo HTML 响应中提取搜索结果
 * 匹配当前 DuckDuckGo HTML 结构（class="result results_links_deep"）
 */
function extractResultsFromHTML(html) {
  const results = [];

  // 匹配每个结果块：<div class="result results_links_deep ...">
  const blockRegex = /<div[^>]*class="[^"]*result[^"]*results_links_deep[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
  let blockMatch;
  while ((blockMatch = blockRegex.exec(html)) !== null) {
    const block = blockMatch[1];

    // 提取标题：<h2 class="result__title"> 或 <a class="result__a">
    const titleMatch = block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const title = titleMatch[1].replace(/<[^>]*>/g, "").trim();
    if (!title) continue;

    // 提取 URL：从 href 属性中获取，或从 DuckDuckGo 重定向链接参数中解码
    const hrefMatch = block.match(/<a[^>]*href="([^"]+)"[^>]*class="[^"]*result__a[^"]*"/i);
    let url = "";
    if (hrefMatch) {
      let href = hrefMatch[1];
      // DuckDuckGo 使用重定向链接 //duckduckgo.com/l/?uddg=...
      if (href.includes("uddg=")) {
        try {
          url = decodeURIComponent(href.match(/uddg=([^&]+)/)?.[1] || "");
        } catch {}
      } else if (href.startsWith("//")) {
        url = "https:" + href;
      } else if (href.startsWith("http")) {
        url = href;
      }
    }
    if (!url) continue;

    // 提取描述：<a class="result__snippet"> 或 <div class="result__snippet">
    const snippetMatch = block.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
      || block.match(/<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const description = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, "").trim() : "";

    results.push({
      title: decodeHTMLEntities(title),
      url,
      description: decodeHTMLEntities(description),
    });
  }

  // 兜底：如果上面匹配不到，用更宽松的匹配
  if (results.length === 0) {
    const fallbackRegex = /<a[^>]*rel="nofollow"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
    let fbMatch;
    while ((fbMatch = fallbackRegex.exec(html)) !== null) {
      let url = fbMatch[1];
      if (url.startsWith("//")) url = "https:" + url;
      const title = fbMatch[2].replace(/<[^>]*>/g, "").trim();
      if (title && url.startsWith("http")) {
        results.push({ title: decodeHTMLEntities(title), url, description: "" });
      }
    }
  }

  return results;
}

async function searchDuckDuckGo({ query, language, time_range, pageno, signal }) {
  try {
    if (!query) throw new Error("Query cannot be empty!");

    const queryParams = {
      q: query,
      kl: language === "zh" ? "cn-zh" : "wt-wt",
      df: time_range || "",
      s: String((pageno || 0) * 30),
    };

    const queryString = Object.entries(queryParams)
      .filter(([_, v]) => v !== "")
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&");

    const searchUrl = `https://html.duckduckgo.com/html/?${queryString}`;

    const response = await fetch(searchUrl, {
      signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        Referer: "https://duckduckgo.com/",
      },
    });

    if (!response.ok) {
      console.error(`[DuckDuckGo] Search failed: ${response.status}`);
      return [];
    }

    const html = await response.text();
    const results = extractResultsFromHTML(html);

    if (results.length === 0) {
      console.log(`[DuckDuckGo] No results found for query: ${query}`);
      return [];
    }

    return normalizeResults(results);
  } catch (error) {
    console.error("[DuckDuckGo] Search error:", error.message);
    return [];
  }
}

export default searchDuckDuckGo;