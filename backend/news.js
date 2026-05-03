const express = require("express");
const axios = require("axios");
const mongoose = require("mongoose");

const router = express.Router();

const NEWS_API_BASE_URL = "https://newsapi.org/v2";
const NEWS_CACHE_MINUTES = Number(process.env.NEWS_CACHE_MINUTES || 60);
const NEWS_CACHE_MS = NEWS_CACHE_MINUTES * 60 * 1000;
const DATA_RETENTION_DAYS = Number(process.env.DATA_RETENTION_DAYS || 30);
const DATA_RETENTION_MS = DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000;

const NewsSourceCacheSchema = new mongoose.Schema({
  cacheKey: { type: String, required: true, unique: true },
  category: String,
  country: String,
  language: String,
  payload: mongoose.Schema.Types.Mixed,
  fetchedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});

NewsSourceCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const NewsSourceCache =
  mongoose.models.NewsSourceCache ||
  mongoose.model("NewsSourceCache", NewsSourceCacheSchema, "NewsSourceCache");

function getRetentionExpiry(fromDate = new Date()) {
  return new Date(fromDate.getTime() + DATA_RETENTION_MS);
}

function isFresh(doc, maxAgeMs) {
  if (!doc?.fetchedAt) return false;
  return Date.now() - new Date(doc.fetchedAt).getTime() < maxAgeMs;
}

function hasUsableNewsPayload(payload) {
  return (
    (Array.isArray(payload?.sources) && payload.sources.length > 0) ||
    (Array.isArray(payload?.articles) && payload.articles.length > 0)
  );
}

function buildCacheKey(params) {
  const parts = Object.keys(params)
    .sort()
    .map((key) => `${key}:${String(params[key] || "").toLowerCase()}`);
  return `news:sources:${parts.join("|")}`;
}

function getFriendlyNewsError(error) {
  const code = error?.response?.data?.code;
  const status = error?.response?.status;

  if (code === "apiKeyMissing") {
    return "News is not configured yet.";
  }
  if (code === "apiKeyInvalid" || status === 401) {
    return "News could not be loaded because the configured key was rejected.";
  }
  if (code === "rateLimited" || status === 429) {
    return "News is temporarily unavailable because the request limit was reached.";
  }
  if (status >= 500) {
    return "News is temporarily unavailable. Please try again later.";
  }

  return "News could not be loaded right now.";
}

async function fetchSportsNews(params, apiKey) {
  const [sourcesResponse, headlinesResponse] = await Promise.all([
    axios.get(`${NEWS_API_BASE_URL}/top-headlines/sources`, {
      params: {
        ...params,
        apiKey,
      },
      timeout: 15000,
    }),
    axios.get(`${NEWS_API_BASE_URL}/top-headlines`, {
      params: {
        category: params.category,
        country: params.country,
        q: "cricket",
        pageSize: 20,
        apiKey,
      },
      timeout: 15000,
    }),
  ]);

  const sourcesPayload = sourcesResponse.data || {};
  const sources = Array.isArray(sourcesPayload.sources) ? sourcesPayload.sources : [];
  const headlineArticles = Array.isArray(headlinesResponse.data?.articles)
    ? headlinesResponse.data.articles
    : [];

  if (headlineArticles.length) {
    return {
      ...sourcesPayload,
      mode: "headlines",
      sources,
      articles: headlineArticles,
      totalResults: headlinesResponse.data?.totalResults || 0,
    };
  }

  const cricketResponse = await axios.get(`${NEWS_API_BASE_URL}/everything`, {
    params: {
      q: "cricket India",
      language: "en",
      sortBy: "publishedAt",
      pageSize: 20,
      apiKey,
    },
    timeout: 15000,
  });

  const cricketArticles = Array.isArray(cricketResponse.data?.articles)
    ? cricketResponse.data.articles
    : [];

  if (cricketArticles.length) {
    return {
      ...sourcesPayload,
      mode: "cricket",
      sources,
      articles: cricketArticles,
      totalResults: cricketResponse.data?.totalResults || 0,
    };
  }

  return {
    ...sourcesPayload,
    mode: "sources",
    sources,
    articles: [],
  };
}

router.get("/sources", async (req, res) => {
  const category = String(req.query.category || "sports").trim();
  const country = String(req.query.country || "in").trim();
  const language = String(req.query.language || "").trim();
  const apiKey = process.env.NEWS_API_KEY;

  if (!apiKey) {
    return res.status(503).json({
      status: "failure",
      message: "News is not configured yet.",
    });
  }

  const params = { category, country };
  if (language) params.language = language;
  const cacheKey = buildCacheKey(params);

  try {
    const cached = await NewsSourceCache.findOne({ cacheKey }).lean();
    if (cached && isFresh(cached, NEWS_CACHE_MS) && hasUsableNewsPayload(cached.payload)) {
      return res.json({
        ...cached.payload,
        cached: true,
        fetchedAt: cached.fetchedAt,
      });
    }

    const newsPayload = await fetchSportsNews(params, apiKey);

    const payload = {
      ...newsPayload,
      cached: false,
      fetchedAt: new Date(),
    };

    await NewsSourceCache.findOneAndUpdate(
      { cacheKey },
      {
        $set: {
          cacheKey,
          category,
          country,
          language,
          payload,
          fetchedAt: payload.fetchedAt,
          expiresAt: getRetentionExpiry(payload.fetchedAt),
        },
      },
      { upsert: true, new: true }
    );

    res.json(payload);
  } catch (error) {
    res.status(500).json({
      status: "failure",
      message: getFriendlyNewsError(error),
    });
  }
});

module.exports = router;
