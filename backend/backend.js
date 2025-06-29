require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// === MongoDB Connection ===
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/CricketVerse";
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB error:"));
db.once("open", () => console.log("✅ Connected to MongoDB"));

// === Schemas ===
const BatterSchema = new mongoose.Schema({
  name: String,
  diss_summary: String,
  runs: String,
  balls: String,
  fours: String,
  sixes: String,
  strike_rate: String,
});
const BowlerSchema = new mongoose.Schema({
  name: String,
  overs: String,
  maidens: String,
  runs_conceded: String,
  wickets: String,
  economy: String,
});

const MatchDataSchema = new mongoose.Schema({
  match_id: String,
  status: String,
  team1: String,
  team2: String,
  score1: String,
  score2: String,
  match_result: String,
  match_url: String,
  match_format: String,
  venue: String,
  date: String,
  toss: String,
  player_of_the_match: String,
  current_run_rate: String,
  inning_1: { batting: [BatterSchema], bowling: [BowlerSchema] },
  inning_2: { batting: [BatterSchema], bowling: [BowlerSchema] },
  createdAt: { type: Date, default: Date.now },
});
const MatchData = mongoose.model("MatchData", MatchDataSchema, "MatchData");

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
const WeatherData = mongoose.model("WeatherData", weatherSchema, "WeatherData");

// === ✅ Weather Fetch Function ===
async function fetchWeatherIfNotExists(city, date) {
  const exists = await WeatherData.findOne({ city, date });
  if (exists) {
    console.log(`🟡 Weather for ${city} on ${date} already exists.`);
    return;
  }

  try {
    const apiKey = process.env.VISUAL_CROSSING_API_KEY;
    const url = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${encodeURIComponent(
      city
    )}?unitGroup=metric&key=${apiKey}&contentType=json`;

    const response = await axios.get(url);

    // Try to find exact match first, else fallback to first entry
    const matchedDay =
      response.data?.days?.find((d) => d.datetime === date) ||
      response.data?.days?.[0];

    if (!matchedDay) {
      console.warn(`⚠️ No weather data found for ${city} on ${date}`);
      return;
    }

    const weather = new WeatherData({
      city,
      date,
      temperature: matchedDay.temp,
      humidity: matchedDay.humidity,
      windSpeed: matchedDay.windspeed,
      cloudCover: matchedDay.cloudcover,
      conditions: matchedDay.conditions,
    });

    await weather.save();
    console.log(`✅ Weather saved for ${city} on ${date}`);
  } catch (err) {
    console.error(`❌ API fetch failed for ${city}:`, err.message);
  }
}

// === 📤 Save Match + Weather ===
app.post("/save-data", async (req, res) => {
  try {
    const payload = req.body;
    if (!Array.isArray(payload)) {
      return res.status(400).send("❌ Expected an array of match data");
    }

    const uniqueWeatherChecks = new Set();

    for (const match of payload) {
      const city = match.venue?.trim();
      const date = match.date?.trim();
      if (!city || !date) {
        console.warn("⛔ Missing city or date in match data.");
        continue;
      }

      const key = `${city.toLowerCase()}|${date}`;
      if (uniqueWeatherChecks.has(key)) {
        continue;
      }

      await fetchWeatherIfNotExists(city, date);
      uniqueWeatherChecks.add(key);
    }

    await MatchData.insertMany(payload);
    console.log("✅ Match + Weather saved");
    res.send("✅ Match and weather data saved.");
  } catch (error) {
    console.error("❌ Failed to save data:", error);
    res.status(500).send("❌ Internal server error");
  }
});

// === 📥 Get Recent Match Data ===
app.get("/get-data", async (req, res) => {
  try {
    const matches = await MatchData.find().sort({ createdAt: -1 }).limit(10);
    res.json(matches);
  } catch (err) {
    console.error("❌ Failed to fetch match data:", err.message);
    res.status(500).send("❌ Failed to fetch match data");
  }
});

// === 🔎 Get Match by Match ID (match_id field)
app.get("/get-match-by-matchid/:matchId", async (req, res) => {
  try {
    const match = await MatchData.findOne({
      match_id: req.params.matchId,
    }).sort({ createdAt: -1 }); // ⬅️ fetch the most recent one
    if (!match) return res.status(404).send("❌ Match not found");
    res.json(match);
  } catch (err) {
    console.error("❌ Error fetching match by match_id:", err.message);
    res.status(500).send("❌ Failed to fetch match");
  }
});

// === 🌤 Manual Weather Fetch ===
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
    console.error("❌ Manual fetch failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// === 🚀 Start Server ===
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
