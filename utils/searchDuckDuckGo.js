import { normalizeResults } from "./index.js";

/**
 * 使用 DuckDuckGo Instant Answer API（零点击摘要）
 * 免费、稳定、不会被限流；返回结果较少但可用
 * 如果无结果，回退到 HTML 爬虫（不稳定）
 */
async function searchDuckDuckGo({ query, signal }) {
  if (!query) return [];

  try {
    // 优先使用 Instant Answer API
    const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const apiResp = await fetch(apiUrl, {
      signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ClawBot/1.0)" },
    });

    if (apiResp.ok) {
      const data = await apiResp.json();
      console.log(`[DuckDuckGo] API keys: ${Object.keys(data).join(", ")}`);
      const results = [];

      // Abstract 摘要
      if (data.AbstractText && data.AbstractURL) {
        results.push({
          title: data.Headline || data.AbstractSource || "摘要",
          url: data.AbstractURL,
          description: data.AbstractText,
        });
      }

      // RelatedTopics 相关结果
      if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics) {
          if (topic.Topics) {
            // 分类下的子话题
            for (const sub of topic.Topics) {
              if (sub.Text && sub.FirstURL) {
                results.push({
                  title: sub.Text.split(" - ")[0] || sub.Text,
                  url: sub.FirstURL,
                  description: sub.Text,
                });
              }
            }
          } else if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.split(" - ")[0] || topic.Text,
              url: topic.FirstURL,
              description: topic.Text,
            });
          }
        }
      }

      if (results.length > 0) {
        return normalizeResults(results);
      }
    }
  } catch {
    // API 失败，回退到 HTML 爬虫
  }

  // 回退：HTML 爬虫（不稳定，可能被限流）
  try {
    const htmlUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const htmlResp = await fetch(htmlUrl, {
      signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html",
        Referer: "https://duckduckgo.com/",
      },
    });
    if (!htmlResp.ok) return [];
    const html = await htmlResp.text();
    if (html.length < 20000) return []; // 太短说明被重定向了

    // 从 HTML 中提取链接（兜底）
    const results = [];
    const linkRe = /<a[^>]*rel="nofollow"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
    let m;
    while ((m = linkRe.exec(html)) !== null) {
      let url = m[1];
      if (url.startsWith("//")) url = "https:" + url;
      const title = m[2].replace(/<[^>]*>/g, "").trim();
      if (title && url.startsWith("http")) {
        results.push({ title, url, description: "" });
        if (results.length >= 8) break;
      }
    }
    if (results.length > 0) return normalizeResults(results);
  } catch {}

  return [];
}

export default searchDuckDuckGo;