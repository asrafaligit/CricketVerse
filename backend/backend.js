const fs = require("fs/promises");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/CricketVerse";
const CRICKET_API_BASE_URL = "https://api.cricapi.com/v1";
const SCORECARD_FIXTURE_PATH =
  process.env.CRICKET_DATA_SCORECARD_FIXTURE_PATH ||
  path.join("Scraping", "fixtures", "sample_scorecard.json");
const LIVE_SCORECARD_REFRESH_MS = 5 * 60 * 1000;
const FAILED_SCORECARD_RETRY_MS = 30 * 60 * 1000;
const COMPLETED_SCORECARD_REFRESH_MS = 24 * 60 * 60 * 1000;
const APP_TIMEZONE = process.env.CRICKET_DATA_TIMEZONE || "Asia/Kolkata";
const DAY_REFRESH_START_HOUR = Number(process.env.DAY_REFRESH_START_HOUR || 8);
const NIGHT_REFRESH_START_HOUR = Number(process.env.NIGHT_REFRESH_START_HOUR || 23);
const DAY_REFRESH_INTERVAL_MS =
  Number(process.env.DAY_REFRESH_INTERVAL_MINUTES || 20) * 60 * 1000;
const NIGHT_REFRESH_INTERVAL_MS =
  Number(process.env.NIGHT_REFRESH_INTERVAL_MINUTES || 60) * 60 * 1000;
const MATCH_FIXTURE_PATH =
  process.env.CRICKET_DATA_FIXTURE_PATH ||
  path.join("Scraping", "fixtures", "sample_matches.json");
const CRICKET_DATA_ENDPOINT = process.env.CRICKET_DATA_ENDPOINT || "matches";

mongoose
  .connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("MongoDB connected");
    startAutoRefreshLoop();
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  });

const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB error:"));

const BatterSchema = new mongoose.Schema(
  {
    name: String,
    team: String,
    innings: String,
    diss_summary: String,
    runs: String,
    balls: String,
    fours: String,
    sixes: String,
    strike_rate: String,
  },
  { _id: false }
);

const BowlerSchema = new mongoose.Schema(
  {
    name: String,
    team: String,
    innings: String,
    overs: String,
    maidens: String,
    runs_conceded: String,
    wickets: String,
    economy: String,
  },
  { _id: false }
);

const ScoreBreakdownSchema = new mongoose.Schema(
  {
    inning: String,
    runs: mongoose.Schema.Types.Mixed,
    wickets: mongoose.Schema.Types.Mixed,
    overs: mongoose.Schema.Types.Mixed,
    summary: String,
  },
  { _id: false }
);

const PerformanceEntrySchema = new mongoose.Schema(
  {
    name: String,
    team: String,
    innings: String,
    role: String,
    dismissal: String,
    runs: Number,
    balls: Number,
    fours: Number,
    sixes: Number,
    strikeRate: Number,
    overs: Number,
    maidens: Number,
    runsConceded: Number,
    wickets: Number,
    economy: Number,
    impactScore: Number,
  },
  { _id: false }
);

const MatchStatsSchema = new mongoose.Schema(
  {
    battingTeam: String,
    bowlingTeam: String,
    target: Number,
    currentRuns: Number,
    currentWickets: Number,
    currentOvers: Number,
    currentBalls: Number,
    currentRunRate: Number,
    requiredRunRate: Number,
    runsRequired: Number,
    ballsRemaining: Number,
    wicketsInHand: Number,
  },
  { _id: false }
);

const MatchDataSchema = new mongoose.Schema({
  match_id: String,
  status: String,
  team1: String,
  team2: String,
  team1_img: String,
  team2_img: String,
  score1: String,
  score2: String,
  match_result: String,
  match_url: String,
  match_format: String,
  venue: String,
  date: String,
  series: String,
  toss: String,
  player_of_the_match: String,
  current_run_rate: String,
  score_breakdown: [ScoreBreakdownSchema],
  inning_1: { batting: [BatterSchema], bowling: [BowlerSchema] },
  inning_2: { batting: [BatterSchema], bowling: [BowlerSchema] },
  top_batters: [PerformanceEntrySchema],
  top_bowlers: [PerformanceEntrySchema],
  current_batters: [PerformanceEntrySchema],
  current_bowlers: [PerformanceEntrySchema],
  match_stats: MatchStatsSchema,
  scorecard_available: { type: Boolean, default: false },
  scorecard_error: { type: String, default: "" },
  scorecard_source: String,
  scorecard_refreshed_at: Date,
  source_endpoint: String,
  last_synced_at: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

const weatherSchema = new mongoose.Schema({
  city: String,
  date: String,
  temperature: Number,
  humidity: Number,
  windSpeed: Number,
  cloudCover: Number,
  conditions: String,
  fetchedAt: { type: Date, default: Date.now },
});

const MatchData = mongoose.model("MatchData", MatchDataSchema, "MatchData");
const WeatherData = mongoose.model("WeatherData", weatherSchema, "WeatherData");

let refreshState = {
  inProgress: false,
  lastRunStartedAt: null,
  lastRunCompletedAt: null,
  lastRunStatus: "idle",
  lastRunError: "",
  lastRunOutput: "",
  trigger: "startup",
  nextRefreshAt: null,
};

function getLocalHour(date = new Date()) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: APP_TIMEZONE,
      hour: "numeric",
      hour12: false,
    }).format(date)
  );
}

function isDayRefreshWindow(date = new Date()) {
  const hour = getLocalHour(date);
  return hour >= DAY_REFRESH_START_HOUR && hour < NIGHT_REFRESH_START_HOUR;
}

function getRefreshIntervalMs(date = new Date()) {
  return isDayRefreshWindow(date)
    ? DAY_REFRESH_INTERVAL_MS
    : NIGHT_REFRESH_INTERVAL_MS;
}

function scheduleNextRefresh() {
  const nextRefreshAt = new Date(Date.now() + getRefreshIntervalMs());
  refreshState.nextRefreshAt = nextRefreshAt;
  return nextRefreshAt;
}

function cleanTeamName(teamName) {
  return String(teamName || "TBD").trim() || "TBD";
}

function parseMatchDateTime(match) {
  const raw = match?.dateTimeGMT;
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  if (match?.date) {
    const parsed = new Date(`${String(match.date).split("T")[0]}T12:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function normalizeStatus(match) {
  const ms = String(match?.ms || "").trim().toLowerCase();
  if (ms === "result") return "RESULT";
  if (ms === "fixture") return "FIXTURE";
  if (ms) return "LIVE";

  if (match?.matchEnded) return "RESULT";
  if (match?.matchStarted) return "LIVE";

  const statusText = String(match?.status || "").toLowerCase();
  if (/(won by|match tied|draw|no result|abandoned)/.test(statusText)) {
    return "RESULT";
  }

  return "FIXTURE";
}

function getTeamNames(match) {
  const teamInfo = toArray(match?.teamInfo).filter((team) => team?.name);
  if (teamInfo.length >= 2) {
    return [cleanTeamName(teamInfo[0].name), cleanTeamName(teamInfo[1].name)];
  }

  const teams = toArray(match?.teams).filter(Boolean).map(cleanTeamName);
  if (teams.length >= 2) {
    return [teams[0], teams[1]];
  }

  return [cleanTeamName(match?.t1), cleanTeamName(match?.t2)];
}

function getTeamImages(match) {
  const teamInfo = toArray(match?.teamInfo);
  if (teamInfo.length >= 2) {
    return [String(teamInfo[0]?.img || ""), String(teamInfo[1]?.img || "")];
  }

  return [String(match?.t1img || ""), String(match?.t2img || "")];
}

function formatScoreSummary(score) {
  const runs = score?.r;
  const wickets = score?.w;
  const overs = score?.o;

  if (runs == null || runs === "") return "";

  let summary = String(runs);
  if (wickets != null && wickets !== "") summary += `/${wickets}`;
  if (overs != null && overs !== "") summary += ` (${overs})`;
  return summary;
}

function buildScoreBreakdown(match, team1, team2) {
  const structuredScores = toArray(match?.score);
  if (structuredScores.length) {
    return structuredScores.map((score) => ({
      inning: String(score?.inning || "").trim(),
      runs: score?.r ?? null,
      wickets: score?.w ?? null,
      overs: score?.o ?? null,
      summary: formatScoreSummary(score),
    }));
  }

  const fallback = [];
  if (match?.t1s) {
    fallback.push({
      inning: `${team1} Inning 1`,
      runs: null,
      wickets: null,
      overs: null,
      summary: String(match.t1s).trim(),
    });
  }
  if (match?.t2s) {
    fallback.push({
      inning: `${team2} Inning 1`,
      runs: null,
      wickets: null,
      overs: null,
      summary: String(match.t2s).trim(),
    });
  }
  return fallback;
}

function extractTeamScores(match, team1, team2) {
  const score1 = String(match?.t1s || "").trim();
  const score2 = String(match?.t2s || "").trim();
  if (score1 || score2) {
    return [score1 || "Yet to bat", score2 || "Yet to bat"];
  }

  const breakdown = buildScoreBreakdown(match, team1, team2);
  return [
    breakdown[0]?.summary || "Yet to bat",
    breakdown[1]?.summary || "Yet to bat",
  ];
}

function normalizeMatch(match, endpoint) {
  const [team1, team2] = getTeamNames(match);
  const [team1_img, team2_img] = getTeamImages(match);
  const score_breakdown = buildScoreBreakdown(match, team1, team2);
  const [score1, score2] = extractTeamScores(match, team1, team2);
  const parsedDate = parseMatchDateTime(match);

  return {
    match_id: String(match?.id || "").trim(),
    status: normalizeStatus(match),
    team1,
    team2,
    team1_img,
    team2_img,
    score1,
    score2,
    match_result: String(match?.status || "Status unavailable").trim(),
    match_url: "",
    match_format: String(match?.matchType || "").trim().toLowerCase(),
    venue: String(match?.venue || "N/A").trim(),
    date: parsedDate ? parsedDate.toISOString().split("T")[0] : "N/A",
    series: String(match?.series || match?.name || "").trim(),
    toss: "N/A",
    player_of_the_match: "N/A",
    current_run_rate: "N/A",
    score_breakdown,
    inning_1: { batting: [], bowling: [] },
    inning_2: { batting: [], bowling: [] },
    source_endpoint: endpoint,
    last_synced_at: new Date(),
  };
}

async function fetchMatchesPayload() {
  if (isFixtureMode()) {
    const fixturePath = getAbsoluteFixturePath(MATCH_FIXTURE_PATH);
    return readJsonFixture(fixturePath);
  }

  const apiKey = process.env.CRICKET_DATA_API_KEY;
  if (!apiKey) {
    throw new Error("CRICKET_DATA_API_KEY is missing");
  }

  const response = await axios.get(`${CRICKET_API_BASE_URL}/${CRICKET_DATA_ENDPOINT}`, {
    params: {
      apikey: apiKey,
      offset: 0,
    },
    timeout: 20000,
  });

  return response.data;
}

async function persistMatches(payload) {
  if (!Array.isArray(payload)) {
    throw new Error("Expected an array of match data");
  }

  const uniqueWeatherChecks = new Set();

  for (const match of payload) {
    if (match.status === "RESULT") {
      continue;
    }

    const city = match.venue?.trim();
    const date = match.date?.trim();
    if (!city || !date || city === "N/A" || date === "N/A") {
      continue;
    }

    const key = `${city.toLowerCase()}|${date}`;
    if (uniqueWeatherChecks.has(key)) {
      continue;
    }

    await fetchWeatherIfNotExists(city, date);
    uniqueWeatherChecks.add(key);
  }

  const documents = payload
    .filter((match) => match.match_id)
    .map((match) => ({
      ...match,
      last_synced_at: new Date(),
      createdAt: new Date(),
    }));

  if (documents.length) {
    await MatchData.insertMany(documents, { ordered: false });
  }

  return documents.length;
}

async function refreshLiveMatchFeed(trigger = "manual") {
  if (refreshState.inProgress) {
    return Promise.resolve({
      ok: false,
      skipped: true,
      reason: "A refresh is already in progress.",
    });
  }

  refreshState = {
    ...refreshState,
    inProgress: true,
    lastRunStartedAt: new Date(),
    lastRunStatus: "running",
    lastRunError: "",
    lastRunOutput: "",
    trigger,
  };

  try {
    const payload = await fetchMatchesPayload();
    const rawMatches = toArray(payload?.data);
    const normalizedMatches = rawMatches
      .map((match) => normalizeMatch(match, isFixtureMode() ? "fixture" : CRICKET_DATA_ENDPOINT))
      .filter((match) => match.match_id);
    const savedCount = await persistMatches(normalizedMatches);
    const creditsLeft = payload?.creditsLeft;
    const output = `Saved ${savedCount} matches${creditsLeft != null ? `, credits left: ${creditsLeft}` : ""}`;

    refreshState = {
      ...refreshState,
      inProgress: false,
      lastRunCompletedAt: new Date(),
      lastRunStatus: "success",
      lastRunError: "",
      lastRunOutput: output,
    };
    scheduleNextRefresh();
    return { ok: true, code: 0, output, error: "" };
  } catch (error) {
    refreshState = {
      ...refreshState,
      inProgress: false,
      lastRunCompletedAt: new Date(),
      lastRunStatus: "failed",
      lastRunError: error.message,
      lastRunOutput: "",
    };
    scheduleNextRefresh();
    return { ok: false, code: null, output: "", error: error.message };
  }
}

function startAutoRefreshLoop() {
  scheduleNextRefresh();

  const tick = async () => {
    const nextRefreshAt = refreshState.nextRefreshAt
      ? new Date(refreshState.nextRefreshAt).getTime()
      : 0;

    if (!refreshState.inProgress && Date.now() >= nextRefreshAt) {
      await refreshLiveMatchFeed("auto");
    }

    setTimeout(tick, 60 * 1000);
  };

  setTimeout(tick, 10 * 1000);
}

function getAbsoluteFixturePath(relativeOrAbsolutePath) {
  return path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(__dirname, "..", relativeOrAbsolutePath);
}

async function readJsonFixture(filePath) {
  const contents = await fs.readFile(filePath, "utf-8");
  return JSON.parse(contents);
}

function isFixtureMode() {
  return String(process.env.CRICKET_DATA_SOURCE || "live").toLowerCase() === "fixture";
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function pickField(source, keys) {
  for (const key of keys) {
    if (source && source[key] != null && source[key] !== "") {
      return source[key];
    }
  }
  return null;
}

function toNumber(value) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function roundNumber(value, digits = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function parseScoreSummary(summary) {
  if (!summary || /yet to bat/i.test(String(summary))) {
    return null;
  }

  const cleaned = String(summary);
  const scoreMatch = cleaned.match(/(\d+)(?:\/(\d+))?/);
  if (!scoreMatch) return null;

  const oversMatch = cleaned.match(/\(([\d.]+)\)/);
  const runs = Number(scoreMatch[1]);
  const wickets = scoreMatch[2] != null ? Number(scoreMatch[2]) : null;
  const overs = oversMatch ? Number(oversMatch[1]) : null;
  const balls = overs != null ? parseOversToBalls(overs) : null;

  return {
    runs,
    wickets,
    overs,
    balls,
  };
}

function parseOversToBalls(oversValue) {
  if (oversValue == null || oversValue === "") return null;

  const [completedOvers, ballsInCurrentOver = "0"] = String(oversValue).split(".");
  const overs = Number(completedOvers);
  const balls = Number(ballsInCurrentOver);

  if (!Number.isFinite(overs) || !Number.isFinite(balls)) return null;
  return overs * 6 + balls;
}

function getBallLimit(matchFormat) {
  const format = String(matchFormat || "").toLowerCase();
  if (format.includes("t20")) return 120;
  if (format.includes("odi")) return 300;
  return null;
}

function inferTeamFromInningName(inningName, match, fallbackIndex = 0) {
  const label = String(inningName || "").toLowerCase();
  const team1 = String(match.team1 || "").toLowerCase();
  const team2 = String(match.team2 || "").toLowerCase();

  if (team1 && label.includes(team1)) return match.team1;
  if (team2 && label.includes(team2)) return match.team2;
  return fallbackIndex === 0 ? match.team1 : match.team2;
}

function normalizeBatterRow(row, teamName, inningsLabel) {
  const playerNode =
    row?.player ||
    row?.batsman ||
    row?.batter ||
    row?.playerDetails ||
    row?.athlete ||
    {};
  const runs = pickField(row, ["runs", "r", "score"]);
  const balls = pickField(row, ["balls", "b"]);
  const fours = pickField(row, ["fours", "4s", "four", "foursCount"]);
  const sixes = pickField(row, ["sixes", "6s", "six", "sixesCount"]);
  const strikeRate = pickField(row, [
    "strikeRate",
    "strike_rate",
    "sr",
    "strike-rate",
  ]);
  const dismissal = pickField(row, [
    "dismissal",
    "dismissalText",
    "dismissal-text",
    "howout",
    "outDesc",
    "out",
  ]);

  return {
    name: String(
      pickField(row, [
        "name",
        "playerName",
        "batsman",
        "batter",
        "batsmanName",
        "fullName",
        "fullname",
      ]) ||
        pickField(playerNode, ["name", "fullName", "fullname", "longName", "shortName"]) ||
        "Unknown Player"
    ),
    team: teamName,
    innings: inningsLabel,
    diss_summary: String(dismissal || "not out"),
    runs: runs != null ? String(runs) : "0",
    balls: balls != null ? String(balls) : "0",
    fours: fours != null ? String(fours) : "0",
    sixes: sixes != null ? String(sixes) : "0",
    strike_rate: strikeRate != null ? String(strikeRate) : "0",
  };
}

function normalizeBowlerRow(row, teamName, inningsLabel) {
  const playerNode =
    row?.player ||
    row?.bowler ||
    row?.playerDetails ||
    row?.athlete ||
    {};
  const overs = pickField(row, ["overs", "o"]);
  const maidens = pickField(row, ["maidens", "m"]);
  const runsConceded = pickField(row, ["runsConceded", "runs", "r"]);
  const wickets = pickField(row, ["wickets", "w"]);
  const economy = pickField(row, ["economy", "econ", "er"]);

  return {
    name: String(
      pickField(row, [
        "name",
        "playerName",
        "bowler",
        "bowlerName",
        "fullName",
        "fullname",
      ]) ||
        pickField(playerNode, ["name", "fullName", "fullname", "longName", "shortName"]) ||
        "Unknown Bowler"
    ),
    team: teamName,
    innings: inningsLabel,
    overs: overs != null ? String(overs) : "0",
    maidens: maidens != null ? String(maidens) : "0",
    runs_conceded: runsConceded != null ? String(runsConceded) : "0",
    wickets: wickets != null ? String(wickets) : "0",
    economy: economy != null ? String(economy) : "0",
  };
}

function buildBatterPerformance(row) {
  return {
    name: row.name,
    team: row.team,
    innings: row.innings,
    role: "batter",
    dismissal: row.diss_summary,
    runs: toNumber(row.runs) || 0,
    balls: toNumber(row.balls) || 0,
    fours: toNumber(row.fours) || 0,
    sixes: toNumber(row.sixes) || 0,
    strikeRate: roundNumber(toNumber(row.strike_rate) || 0),
    overs: null,
    maidens: null,
    runsConceded: null,
    wickets: null,
    economy: null,
    impactScore:
      (toNumber(row.runs) || 0) +
      (toNumber(row.fours) || 0) +
      (toNumber(row.sixes) || 0) * 2,
  };
}

function buildBowlerPerformance(row) {
  const wickets = toNumber(row.wickets) || 0;
  const maidens = toNumber(row.maidens) || 0;
  const economy = toNumber(row.economy);
  return {
    name: row.name,
    team: row.team,
    innings: row.innings,
    role: "bowler",
    dismissal: "",
    runs: null,
    balls: null,
    fours: null,
    sixes: null,
    strikeRate: null,
    overs: toNumber(row.overs),
    maidens,
    runsConceded: toNumber(row.runs_conceded) || 0,
    wickets,
    economy: economy != null ? roundNumber(economy) : null,
    impactScore: wickets * 25 + maidens * 8 - (toNumber(row.runs_conceded) || 0) * 0.05,
  };
}

function buildMatchStats(match, innings) {
  const firstSummary = parseScoreSummary(innings[0]?.summary || match.score1);
  const secondSummary = parseScoreSummary(innings[1]?.summary || match.score2);
  const currentSummary = secondSummary || firstSummary;
  const isChasing = Boolean(firstSummary && secondSummary);
  const battingTeam = isChasing ? match.team2 : match.team1;
  const bowlingTeam = isChasing ? match.team1 : match.team2;
  const target = isChasing && firstSummary ? firstSummary.runs + 1 : null;
  const ballLimit = getBallLimit(match.match_format);
  const currentBalls = currentSummary?.balls ?? null;
  const currentRunRate =
    currentSummary && currentBalls > 0
      ? roundNumber((currentSummary.runs / currentBalls) * 6)
      : null;
  const ballsRemaining =
    ballLimit != null && currentBalls != null
      ? Math.max(ballLimit - currentBalls, 0)
      : null;
  const runsRequired =
    target != null && currentSummary ? Math.max(target - currentSummary.runs, 0) : null;
  const requiredRunRate =
    runsRequired != null && ballsRemaining > 0
      ? roundNumber(runsRequired / (ballsRemaining / 6))
      : null;
  const wicketsInHand =
    currentSummary?.wickets != null ? Math.max(10 - currentSummary.wickets, 0) : null;

  return {
    battingTeam,
    bowlingTeam,
    target,
    currentRuns: currentSummary?.runs ?? null,
    currentWickets: currentSummary?.wickets ?? null,
    currentOvers: currentSummary?.overs ?? null,
    currentBalls,
    currentRunRate,
    requiredRunRate,
    runsRequired,
    ballsRemaining,
    wicketsInHand,
  };
}

function buildCurrentBatters(data, innings) {
  const source = toArray(
    pickField(data, [
      "currentBatters",
      "currentBatsmen",
      "batsmen",
      "batsman",
      "liveBatters",
    ])
  );

  if (source.length) {
    const currentInnings = innings[innings.length - 1];
    const teamName = currentInnings?.teamName || "";
    const inningsLabel = currentInnings?.inningsLabel || "";
    return source
      .map((row) =>
        buildBatterPerformance(normalizeBatterRow(row, teamName, inningsLabel))
      )
      .slice(0, 2);
  }

  const lastInningsBatters = toArray(innings[innings.length - 1]?.batting || []);
  const notOutBatters = lastInningsBatters.filter((player) =>
    /not out/i.test(String(player.diss_summary || ""))
  );

  return (notOutBatters.length ? notOutBatters : lastInningsBatters)
    .map((row) => buildBatterPerformance(row))
    .slice(0, 2);
}

function buildCurrentBowlers(data, innings) {
  const source = toArray(
    pickField(data, [
      "currentBowlers",
      "currentBowler",
      "bowlers",
      "bowler",
      "liveBowlers",
    ])
  );

  if (source.length) {
    const currentInnings = innings[innings.length - 1];
    const teamName =
      currentInnings?.teamName === currentInnings?.match?.team1
        ? currentInnings?.match?.team2
        : currentInnings?.match?.team1;
    const inningsLabel = currentInnings?.inningsLabel || "";
    return source
      .map((row) =>
        buildBowlerPerformance(normalizeBowlerRow(row, teamName || "", inningsLabel))
      )
      .slice(0, 2);
  }

  const lastInningsBowlers = toArray(innings[innings.length - 1]?.bowling || []);
  return lastInningsBowlers
    .map((row) => buildBowlerPerformance(row))
    .sort((left, right) => (right.overs || 0) - (left.overs || 0))
    .slice(0, 2);
}

function parseScorecardPayload(match, payload, sourceLabel) {
  const data = payload?.data || payload || {};
  const inningsSource = toArray(
    pickField(data, ["scorecard", "scoreCard", "innings", "score"])
  ).slice(0, 2);

  const normalizedInnings = inningsSource.map((inning, index) => {
    const inningsLabel = String(
      pickField(inning, ["inning", "inningName", "name", "title"]) ||
        `${index === 0 ? match.team1 : match.team2} Inning ${index + 1}`
    );
    const teamName = inferTeamFromInningName(inningsLabel, match, index);
    const batting = toArray(pickField(inning, ["batting", "batters", "batsmen"]))
      .map((row) => normalizeBatterRow(row, teamName, inningsLabel));
    const bowlingTeam = teamName === match.team1 ? match.team2 : match.team1;
    const bowling = toArray(pickField(inning, ["bowling", "bowlers"]))
      .map((row) => normalizeBowlerRow(row, bowlingTeam, inningsLabel));
    const summary = String(
      pickField(inning, ["score", "summary", "inningScore", "scoreSummary"]) || ""
    );

    return {
      match,
      teamName,
      inningsLabel,
      summary,
      batting,
      bowling,
    };
  });

  const allBatters = normalizedInnings.flatMap((inning) => inning.batting);
  const allBowlers = normalizedInnings.flatMap((inning) => inning.bowling);
  const topBatters = allBatters
    .map((row) => buildBatterPerformance(row))
    .sort((left, right) => {
      if (right.runs !== left.runs) return right.runs - left.runs;
      if ((right.strikeRate || 0) !== (left.strikeRate || 0)) {
        return (right.strikeRate || 0) - (left.strikeRate || 0);
      }
      return (right.balls || 0) - (left.balls || 0);
    })
    .slice(0, 6);

  const topBowlers = allBowlers
    .map((row) => buildBowlerPerformance(row))
    .sort((left, right) => {
      if ((right.wickets || 0) !== (left.wickets || 0)) {
        return (right.wickets || 0) - (left.wickets || 0);
      }
      return (left.economy || 999) - (right.economy || 999);
    })
    .slice(0, 6);

  const currentBatters = buildCurrentBatters(data, normalizedInnings);
  const currentBowlers = buildCurrentBowlers(data, normalizedInnings);
  const matchStats = buildMatchStats(match, normalizedInnings);

  return {
    toss:
      String(
        pickField(data, ["toss", "tossText", "tossInfo"]) ||
          match.toss ||
          "N/A"
      ) || "N/A",
    player_of_the_match:
      String(
        pickField(data, [
          "player_of_the_match",
          "playerOfTheMatch",
          "potm",
          "manOfTheMatch",
        ]) ||
          match.player_of_the_match ||
          "N/A"
      ) || "N/A",
    current_run_rate:
      matchStats.currentRunRate != null
        ? String(matchStats.currentRunRate)
        : match.current_run_rate || "N/A",
    score_breakdown:
      normalizedInnings
        .map((inning) => {
          const parsedSummary = parseScoreSummary(inning.summary);
          return {
            inning: inning.inningsLabel,
            runs: parsedSummary?.runs ?? null,
            wickets: parsedSummary?.wickets ?? null,
            overs: parsedSummary?.overs ?? null,
            summary: inning.summary || "Score unavailable",
          };
        })
        .filter((inning) => inning.summary && inning.summary !== "Score unavailable") ||
      match.score_breakdown,
    inning_1: normalizedInnings[0]
      ? {
          batting: normalizedInnings[0].batting,
          bowling: normalizedInnings[0].bowling,
        }
      : match.inning_1,
    inning_2: normalizedInnings[1]
      ? {
          batting: normalizedInnings[1].batting,
          bowling: normalizedInnings[1].bowling,
        }
      : match.inning_2,
    top_batters: topBatters,
    top_bowlers: topBowlers,
    current_batters: currentBatters,
    current_bowlers: currentBowlers,
    match_stats: matchStats,
    scorecard_available: Boolean(topBatters.length || topBowlers.length),
    scorecard_error: "",
    scorecard_source: sourceLabel,
    scorecard_refreshed_at: new Date(),
  };
}

function shouldRefreshScorecard(match) {
  const lastRefreshed = match.scorecard_refreshed_at
    ? new Date(match.scorecard_refreshed_at).getTime()
    : 0;
  const ageMs = Date.now() - lastRefreshed;

  if (!lastRefreshed) return true;
  if (!match.scorecard_available) return ageMs > FAILED_SCORECARD_RETRY_MS;
  if (match.status === "RESULT") return ageMs > COMPLETED_SCORECARD_REFRESH_MS;
  return ageMs > LIVE_SCORECARD_REFRESH_MS;
}

async function loadScorecardPayload(matchId) {
  if (isFixtureMode()) {
    const fixturePath = getAbsoluteFixturePath(SCORECARD_FIXTURE_PATH);
    const fixturePayload = await readJsonFixture(fixturePath);
    const fixtureData = toArray(fixturePayload?.data);
    const matched = fixtureData.find((entry) => entry.id === matchId);

    if (!matched) {
      return {
        status: "failure",
        reason: `Fixture scorecard not found for ${matchId}`,
      };
    }

    return {
      status: "success",
      data: matched,
    };
  }

  const apiKey = process.env.CRICKET_DATA_API_KEY;
  if (!apiKey) {
    return {
      status: "failure",
      reason: "CRICKET_DATA_API_KEY is missing",
    };
  }

  const response = await axios.get(`${CRICKET_API_BASE_URL}/match_scorecard`, {
    params: {
      apikey: apiKey,
      offset: 0,
      id: matchId,
    },
    timeout: 20000,
  });

  return response.data;
}

async function enrichMatchIfNeeded(match) {
  if (!match || !shouldRefreshScorecard(match)) {
    return match;
  }

  try {
    const payload = await loadScorecardPayload(match.match_id);
    if (payload?.status !== "success" || !payload?.data) {
      return MatchData.findOneAndUpdate(
        { match_id: match.match_id },
        {
          $set: {
            scorecard_available: false,
            scorecard_error: String(payload?.reason || "Scorecard unavailable"),
            scorecard_refreshed_at: new Date(),
          },
        },
        { new: true }
      ).lean();
    }

    const parsedPayload = parseScorecardPayload(
      match,
      payload,
      isFixtureMode() ? "fixture-scorecard" : "live-scorecard"
    );

    return MatchData.findOneAndUpdate(
      { match_id: match.match_id },
      { $set: parsedPayload },
      { new: true }
    ).lean();
  } catch (error) {
    const message =
      error?.response?.data?.reason ||
      error?.response?.data?.message ||
      error.message ||
      "Scorecard request failed";

    return MatchData.findOneAndUpdate(
      { match_id: match.match_id },
      {
        $set: {
          scorecard_available: false,
          scorecard_error: String(message),
          scorecard_refreshed_at: new Date(),
        },
      },
      { new: true }
    ).lean();
  }
}

async function fetchWeatherIfNotExists(city, date) {
  const exists = await WeatherData.findOne({ city, date });
  if (exists) {
    return;
  }

  try {
    const apiKey = process.env.VISUAL_CROSSING_API_KEY;
    const url = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${encodeURIComponent(
      city
    )}?unitGroup=metric&key=${apiKey}&contentType=json`;

    const response = await axios.get(url);
    const matchedDay =
      response.data?.days?.find((day) => day.datetime === date) ||
      response.data?.days?.[0];

    if (!matchedDay) {
      return;
    }

    await new WeatherData({
      city,
      date,
      temperature: matchedDay.temp,
      humidity: matchedDay.humidity,
      windSpeed: matchedDay.windspeed,
      cloudCover: matchedDay.cloudcover,
      conditions: matchedDay.conditions,
    }).save();
  } catch (err) {
    console.error(`Weather fetch failed for ${city}:`, err.message);
  }
}

app.get("/", (req, res) => {
  res.send("CricketVerse Backend API is running");
});

app.post("/save-data", async (req, res) => {
  try {
    await persistMatches(req.body);
    res.send("Match and weather data saved.");
  } catch (error) {
    console.error("Failed to save data:", error);
    res.status(500).send(error.message || "Internal server error");
  }
});

app.get("/get-data", async (req, res) => {
  try {
    const parsedLimit = Number(req.query.limit);
    const limitStage = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? [{ $limit: parsedLimit }]
      : [];
    const matches = await MatchData.aggregate([
      { $sort: { last_synced_at: -1, createdAt: -1 } },
      { $group: { _id: "$match_id", doc: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$doc" } },
      { $sort: { last_synced_at: -1, createdAt: -1 } },
      ...limitStage,
    ]);
    res.json(matches);
  } catch (err) {
    console.error("Failed to fetch match data:", err.message);
    res.status(500).send("Failed to fetch match data");
  }
});

app.get("/get-match-by-matchid/:matchId", async (req, res) => {
  try {
    const includePerformance = req.query.includePerformance === "true";
    let match = await MatchData.findOne({
      match_id: req.params.matchId,
    })
      .sort({ last_synced_at: -1, createdAt: -1 })
      .lean();

    if (!match) {
      return res.status(404).send("Match not found");
    }

    if (includePerformance) {
      match = await enrichMatchIfNeeded(match);
    }

    res.json(match);
  } catch (err) {
    console.error("Error fetching match by match_id:", err.message);
    res.status(500).send("Failed to fetch match");
  }
});

app.get("/get-match-history/:matchId", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const history = await MatchData.find({ match_id: req.params.matchId })
      .sort({ last_synced_at: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    res.json(history);
  } catch (err) {
    console.error("Error fetching match history:", err.message);
    res.status(500).send("Failed to fetch match history");
  }
});

app.get("/get-weather-by-match/:matchId", async (req, res) => {
  try {
    const match = await MatchData.findOne({ match_id: req.params.matchId })
      .sort({ last_synced_at: -1, createdAt: -1 })
      .lean();

    if (!match) {
      return res.status(404).send("Match not found");
    }

    const city = String(match.venue || "").trim();
    const date = String(match.date || "").trim();

    if (!city || !date || city === "N/A" || date === "N/A") {
      return res.status(404).send("Weather unavailable for this match");
    }

    await fetchWeatherIfNotExists(city, date);
    const weather = await WeatherData.findOne({ city, date })
      .sort({ fetchedAt: -1 })
      .lean();

    if (!weather) {
      return res.status(404).send("Weather unavailable for this match");
    }

    res.json(weather);
  } catch (err) {
    console.error("Error fetching weather by match:", err.message);
    res.status(500).send("Failed to fetch match weather");
  }
});

app.get("/refresh-status", (req, res) => {
  res.json({
    ...refreshState,
    recommendedIntervalMs: getRefreshIntervalMs(),
    window: isDayRefreshWindow() ? "day" : "night",
    timezone: APP_TIMEZONE,
  });
});

app.post("/refresh-live-data", async (req, res) => {
  const result = await refreshLiveMatchFeed("manual");

  if (result.skipped) {
    return res.status(409).json({
      message: result.reason,
      refreshState,
    });
  }

  if (!result.ok) {
    return res.status(500).json({
      message: "Refresh failed",
      ...result,
      refreshState,
    });
  }

  res.json({
    message: "Refresh completed",
    ...result,
    refreshState,
  });
});

app.get("/fetch-weather/:city", async (req, res) => {
  const city = req.params.city;
  const apiKey = process.env.VISUAL_CROSSING_API_KEY;

  try {
    const url = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${encodeURIComponent(
      city
    )}?unitGroup=metric&key=${apiKey}&contentType=json`;
    const response = await axios.get(url);
    res.json(response.data);
  } catch (err) {
    console.error("Manual weather fetch failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});
