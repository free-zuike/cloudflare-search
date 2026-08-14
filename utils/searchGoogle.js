import { normalizeResults } from "./index.js";
import { env } from "../envs.js";

// OAuth2 token 缓存（有效期 1 小时，提前 5 分钟刷新）
let tokenCache = { token: null, expiresAt: 0 };

// 用 Service Account JWT 换取 OAuth2 access token
async function getOAuth2Token() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 300000) {
    return tokenCache.token;
  }

  const saJson = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON 未配置");
  }
  const sa = typeof saJson === "string" ? JSON.parse(saJson) : saJson;
  const { client_email, private_key } = sa;
  if (!client_email || !private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON 缺少 client_email 或 private_key");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: client_email,
    scope: "https://www.googleapis.com/auth/cse",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const b64url = (obj) => btoa(JSON.stringify(obj))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const signatureInput = `${b64url(header)}.${b64url(payload)}`;

  // 解析 PEM 私钥
  const pem = private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    cryptoKey,
    new TextEncoder().encode(signatureInput)
  );

  const jwt = `${signatureInput}.${btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`;

  // 换取 access token
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OAuth2 token exchange failed: ${resp.status} ${err.slice(0, 200)}`);
  }

  const data = await resp.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
  return tokenCache.token;
}

async function searchGoogle({ query, language, time_range, pageno, signal, _retried }) {
  const token = await getOAuth2Token();
  const searchUrl = `https://www.googleapis.com/customsearch/v1?cx=${env.GOOGLE_CX}&q=${encodeURIComponent(query)}`;

  const response = await fetch(searchUrl, {
    signal,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error(errBody);
    // 401 可能是 token 过期，清除缓存后重试一次（防止递归）
    if (response.status === 401 && !_retried) {
      tokenCache = { token: null, expiresAt: 0 };
      return searchGoogle({ query, signal, _retried: true });
    }
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