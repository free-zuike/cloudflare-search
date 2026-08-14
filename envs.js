export const env = {
  // 默认超时时间(毫秒) - Default timeout in milliseconds
  DEFAULT_TIMEOUT: "3000",

  // 支持的搜索引擎列表 - Supported search engines
  SUPPORTED_ENGINES: ["google", "brave", "duckduckgo", "bing"],

  // 默认启用的搜索引擎 - Default enabled engines
  DEFAULT_ENGINES: [
    "google",
    "brave",
    "duckduckgo",
    "bing",
  ],

  // Google Custom Search API credentials
  // 方式一：API Key（已弃用，Google 不再支持）
  GOOGLE_API_KEY: null,
  // 方式二：OAuth2 Service Account（推荐）
  // 设置 GOOGLE_SERVICE_ACCOUNT_JSON 为完整的 Service Account JSON key 字符串
  // 同时需要 GOOGLE_CX（搜索引擎 ID）
  GOOGLE_SERVICE_ACCOUNT_JSON: null,
  GOOGLE_CX: null,

  // API 访问令牌 - API access token for authentication
  // 如果设置了 TOKEN，则所有 /search 请求都需要在 header 或 query 中提供此 token
  // If TOKEN is set, all /search requests must provide this token in header or query
  TOKEN: null,
};

export const setEnv = (newEnv) => {
  Object.assign(env, newEnv);
};
