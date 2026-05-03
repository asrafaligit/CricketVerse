# Deployment Guide

This branch is ready to redeploy without relying on the scheduled GitHub scraper.

## Recommended Hosting Layout

- Frontend: Vercel, rooted at `frontend/`
- Backend API: Render web service, rooted at `backend/`
- Prediction API: Render web service, rooted at `prediction/`
- Toss advisor API: Render web service, rooted at `prediction/`
- Database: MongoDB Atlas

## Important Change

The live match refresh now happens inside `backend/backend.js`.

That means:

- Render keeps the backend process alive
- the backend fetches live matches and scorecards itself
- MongoDB Atlas stores the snapshots and TTL cleanup data
- the old GitHub Actions scraper is no longer part of the normal production path

The GitHub workflow is left as manual-only for emergency or legacy runs.

## 1. Deploy the Backend on Render

Create a new Blueprint deployment in Render using the repo root. Render will detect [render.yaml](/d:/college/IIIrd_sem/CricketVerse/render.yaml).

Set these backend environment variables in Render:

- `MONGO_URI`
- `CRICKET_DATA_API_KEY`
- `VISUAL_CROSSING_API_KEY`
- `NEWS_API_KEY`

Useful defaults already exist in `render.yaml`:

- `CRICKET_DATA_SOURCE=live`
- `CRICKET_DATA_ENDPOINT=matches`
- `LIVE_MATCH_CACHE_MINUTES=60`
- `DATA_RETENTION_DAYS=30`
- `DAY_REFRESH_INTERVAL_MINUTES=20`
- `NIGHT_REFRESH_INTERVAL_MINUTES=60`
- `CRICKET_DATA_TIMEZONE=Asia/Kolkata`

After deploy, verify:

- `GET /`
- `GET /refresh-status`
- `GET /get-data`

## 2. Deploy the Python Services on Render

The same `render.yaml` also defines:

- `cricketverse-prediction`
- `cricketverse-toss-advisor`

These run from `prediction/` and use `prediction/requirements.txt`.

After deploy, note both public URLs. You will use them in Vercel:

- prediction URL for `REACT_APP_PREDICTION_API_URL`
- toss advisor URL for `REACT_APP_TOSS_ADVISOR_API_URL`

## 3. Deploy the Frontend on Vercel

In Vercel:

- import the same repo
- set the project root to `frontend`
- framework preset: Create React App

Set frontend environment variables:

- `REACT_APP_API_URL=https://your-backend-service.onrender.com`
- `REACT_APP_PREDICTION_API_URL=https://your-prediction-service.onrender.com`
- `REACT_APP_TOSS_ADVISOR_API_URL=https://your-toss-service.onrender.com`

`frontend/vercel.json` is included so React routes like `/match/:id` resolve correctly on refresh.

## 4. MongoDB Atlas

Make sure the Atlas network access rules allow Render to connect.

Usually the easiest path is:

- temporarily allow `0.0.0.0/0` while testing
- later tighten rules if you want stricter access control

Also confirm the database user in `MONGO_URI` has read/write access to the target database.

## 5. What You No Longer Need

You do not need the scheduled GitHub scraper for standard production hosting on this branch.

Why:

- backend refresh is already built in
- scheduled scraper can create conflicting assumptions about where live data comes from
- fewer moving parts means fewer silent failures

## 6. Deployment Order

Use this order:

1. Deploy backend on Render
2. Deploy prediction service on Render
3. Deploy toss advisor service on Render
4. Add the three public URLs to Vercel env vars
5. Redeploy the Vercel frontend

## 7. Quick Smoke Test

After everything is live:

1. open the frontend home page
2. confirm matches load
3. open one match details page
4. confirm `/refresh-live-data` works from the UI
5. open News and Toss Advisor
6. verify backend logs show successful refreshes instead of key or Mongo errors
