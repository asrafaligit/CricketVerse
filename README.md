# 🏏 CricketVerse

![Build Status](https://img.shields.io/github/actions/workflow/status/asrafaligit/CricketVerse/scraper.yml?branch=main)
![Repo Size](https://img.shields.io/github/repo-size/asrafaligit/CricketVerse)
![Last Commit](https://img.shields.io/github/last-commit/asrafaligit/CricketVerse)
![Issues](https://img.shields.io/github/issues/asrafaligit/CricketVerse)
![License](https://img.shields.io/badge/license-MIT-green)

---

## 📌 Overview

**CricketVerse** is a full-stack live cricket match tracking and prediction platform.

- 🔍 Scrapes **live scores** from ESPN CricInfo.
- ☁️ Stores **match data** in **MongoDB Atlas**.
- 🔄 Fetches **weather data** for match venues.
- 🧩 Runs **ML models** to predict match outcomes & toss decisions.
- ⚙️ Provides REST APIs for your frontend.
- 🌐 Deployed with **Render**, **GitHub Actions** for automation.

---

## 📂 Project Structure

CricketVerse/
├── backend/ # Express server (Node.js)
│ ├── backend.js
│ ├── .env # Environment variables (Mongo URI, API keys)
│ ├── package.json
├── Scraping/ # Python scraper (BeautifulSoup, Requests)
│ ├── Scraper.py
├── .github/workflows/ # GitHub Actions for cron scraping
│ ├── scraper.yml
├── README.md # This file!

markdown
Copy
Edit

---

## ⚙️ Tech Stack

- **Frontend:** React (separate repo or `/frontend` if included)
- **Backend:** Node.js + Express
- **Database:** MongoDB Atlas
- **Scraper:** Python (Requests, BeautifulSoup)
- **Automation:** GitHub Actions
- **Deployment:** Render

---

## 🚀 How It Works

1️⃣ **Python Scraper**

- Runs every **5 mins** (GitHub Actions).
- Fetches live matches, scorecards, venues & dates.
- Sends data to backend API `/save-data`.

2️⃣ **Express Backend**

- Receives & stores match data.
- Calls **Visual Crossing Weather API** if weather is missing.
- Provides `/get-data` & `/get-match-by-matchid` endpoints.

3️⃣ **Frontend**

- Calls backend APIs.
- Displays live scores, win predictions, toss advisor.

---

## 🔑 Environment Variables

You **must** set these:

| Key                       | Description                     |
| ------------------------- | ------------------------------- |
| `MONGO_URI`               | MongoDB Atlas connection string |
| `VISUAL_CROSSING_API_KEY` | Weather API key                 |
| `REACT_APP_API_URL`       | Backend base URL (for scraper)  |

**Where to add:**

- `.env` in `/backend`
- GitHub → `Settings` → `Secrets` → `Actions` → add `REACT_APP_API_URL`

---

## ⚙️ Running Locally

**Backend:**

```bash
cd backend
npm install
node backend.js
Scraper (manual):

bash
Copy
Edit
cd Scraping
pip install requests beautifulsoup4 fake-useragent python-dotenv
python Scraper.py
⚡ GitHub Actions Cron
Runs automatically every 5 mins.

File: .github/workflows/scraper.yml

Also can be triggered manually under Actions tab.

🧠 Predictions
2 ML models:

Win probability

Toss decision

(These should be deployed via backend routes like /predict-win or /predict-toss. Not detailed here.)

🌍 Deployment
Backend: Render

Frontend: (same or different host)

Database: MongoDB Atlas

📜 License
MIT License

🙌 Author
Asraf Ali

⭐️ Show Support
If you find this useful:

✅ Star this repo
✅ Fork & contribute
✅ Open issues & pull requests

📣 Feedback
Feel free to file an issue or connect with me for improvements.
```
