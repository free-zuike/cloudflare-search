import { normalizeResults } from "./index.js";
import { env } from "../envs.js";

// type subSearch under index.d.ts
// TODO: support language, time_range, pageno
async function searchGoogle({ query, language, time_range, pageno, signal }) {
  const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${env.GOOGLE_API_KEY}&cx=${env.GOOGLE_CX}&q=${encodeURIComponent(
    query
  )}`;

  const response = await fetch(searchUrl, { signal });

  if (!response.ok) {
    const errBody = await response.text();
    console.error(errBody);
    // 抛出错误信息，让上层能返回给调用方
    throw new Error(`Google API error ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await response.json();
  const results = [];

  if (data.items && Array.isArray(data.items)) {
    for (const item of data.items) {
      results.push({
        title: item.title,
        url: item.link,
        content: item.snippet || "",
      });
    }
  }

  return normalizeResults(results);
}

export default searchGoogle;
