import { useEffect, useMemo, useState } from "react";
import {
  ArrowSquareOut,
  ArrowsClockwise,
  Clock,
  GlobeHemisphereEast,
  NewspaperClipping,
  WarningCircle,
} from "@phosphor-icons/react";
import { API_BASE_URL } from "../config";

function formatNewsTime(value, fallback = "Latest") {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;

  const seconds = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  return parsed.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const NewsPanel = () => {
  const [sources, setSources] = useState([]);
  const [articles, setArticles] = useState([]);
  const [meta, setMeta] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fetchSources = async ({ manual = false } = {}) => {
    if (manual) setRefreshing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/news/sources?category=sports&country=in`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || "News could not be loaded right now.");
      }

      setSources(Array.isArray(payload.sources) ? payload.sources : []);
      setArticles(Array.isArray(payload.articles) ? payload.articles : []);
      setMeta(payload);
      setError("");
    } catch (err) {
      setError(err.message || "News could not be loaded right now.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSources();
  }, []);

  const filteredSources = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sources;
    return sources.filter((source) =>
      [source.name, source.description, source.category, source.country, source.language]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [query, sources]);

  const filteredArticles = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return articles;
    return articles.filter((article) =>
      [article.title, article.description, article.source?.name]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [articles, query]);

  if (loading) return <div className="state-panel">Loading cricket news...</div>;

  const hasArticles = filteredArticles.length > 0;

  return (
    <section className="dashboard-stack">
      <div className="command-panel">
        <div>
          <p className="eyebrow">NewsAPI</p>
          <h2>Cricket news</h2>
          <p>Fresh headlines from Indian sports sources.</p>
        </div>
        <button className="button button--primary" onClick={() => fetchSources({ manual: true })}>
          <ArrowsClockwise size={18} weight="bold" className={refreshing ? "spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="alert-panel">
          <WarningCircle size={20} weight="duotone" />
          <span>{error}</span>
        </div>
      )}

      <div className="toolbar">
        <label className="search-box search-box--wide">
          <NewspaperClipping size={18} weight="bold" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search news"
          />
        </label>
        <div className="cache-chip">
          <GlobeHemisphereEast size={17} weight="duotone" />
          {meta?.cached ? "Cached" : "Fresh"} {formatNewsTime(meta?.fetchedAt, "recently")}
        </div>
      </div>

      {hasArticles ? (
        <div className="news-list">
          {filteredArticles.map((article) => {
            const RowTag = article.url ? "a" : "article";
            const rowProps = article.url
              ? { href: article.url, target: "_blank", rel: "noreferrer" }
              : {};

            return (
              <RowTag className="news-row" key={article.url || article.title} {...rowProps}>
                <div className="news-row__media">
                  {article.urlToImage ? (
                    <img src={article.urlToImage} alt="" loading="lazy" />
                  ) : (
                    <NewspaperClipping size={24} weight="duotone" />
                  )}
                </div>
                <div className="news-row__body">
                  <div className="news-row__meta">
                    <span>{article.source?.name || "Sports"}</span>
                    <span>
                      <Clock size={14} weight="bold" />
                      {formatNewsTime(article.publishedAt)}
                    </span>
                  </div>
                  <h3>{article.title || "Sports headline"}</h3>
                  <p>{article.description || "No summary available."}</p>
                </div>
                <ArrowSquareOut className="news-row__action" size={20} weight="bold" />
              </RowTag>
            );
          })}
        </div>
      ) : (
        <div className="news-list">
          {filteredSources.map((source) => {
            const RowTag = source.url ? "a" : "article";
            const rowProps = source.url
              ? { href: source.url, target: "_blank", rel: "noreferrer" }
              : {};

            return (
              <RowTag className="news-row" key={source.id || source.url} {...rowProps}>
                <div className="news-row__media">
                  <NewspaperClipping size={24} weight="duotone" />
                </div>
                <div className="news-row__body">
                  <div className="news-row__meta">
                    <span>{source.category || "sports"}</span>
                    <span>{String(source.country || "in").toUpperCase()}</span>
                  </div>
                  <h3>{source.name}</h3>
                  <p>{source.description || "No description available."}</p>
                </div>
                <ArrowSquareOut className="news-row__action" size={20} weight="bold" />
              </RowTag>
            );
          })}
        </div>
      )}

      {!filteredSources.length && !filteredArticles.length && (
        <div className="state-panel">No cricket news matched your search.</div>
      )}
    </section>
  );
};

export default NewsPanel;
