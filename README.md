# CricketVerse

CricketVerse is a live cricket match dashboard with match tracking, weather context, win prediction, and toss-decision support.

## Stack

- Frontend: React
- Core backend: Node.js + Express + MongoDB
- Prediction service: Flask on port `5000`
- Toss advisor service: Flask on port `5001`

## Current Data Flow

The live match feed is now fetched directly by the Node backend from CricAPI.

- `backend/backend.js` fetches match lists and scorecards
- the backend stores every snapshot in MongoDB
- `/get-data` returns the newest snapshot per match
- weather is fetched through Visual Crossing and attached by venue/date
- the frontend reads only backend APIs

The backend auto-refresh cadence is:

- Day: every `20` minutes from `08:00` to `23:00` Asia/Kolkata
- Night: every `60` minutes from `23:00` to `08:00` Asia/Kolkata

## Run Locally

### 1. Start the backend

```bash
cd backend
npm install
node backend.js
```

### 2. Start the frontend

```bash
cd frontend
npm install
npm start
```

### 3. Start optional ML services

Prediction service:

```bash
cd prediction
python predict_server.py
```

Toss advisor:

```bash
cd prediction
python decision_advisor.py
```

## Environment Variables

Backend:

- `MONGO_URI`
- `CRICKET_DATA_API_KEY`
- `VISUAL_CROSSING_API_KEY`
- `CRICKET_DATA_SOURCE` (`live` or `fixture`)
- `DAY_REFRESH_INTERVAL_MINUTES`
- `NIGHT_REFRESH_INTERVAL_MINUTES`
- `DAY_REFRESH_START_HOUR`
- `NIGHT_REFRESH_START_HOUR`

Frontend:

- `REACT_APP_API_URL`
- `REACT_APP_PREDICTION_API_URL`
- `REACT_APP_TOSS_ADVISOR_API_URL`

## Notes

- `Scraping/api_source.py` is no longer part of the active Node refresh pipeline, but it is still referenced by older helper/tests files. Do not delete it yet unless you also remove or rewrite those references.
- `frontend/build/` is generated output and should not be committed as source.
