# Local Development Workflow

This project now supports a local-first workflow so you can test changes without depending on the deployed app or spending cricket API credits every time.

## Environment Files

Use the root [`.env.example`](/d:/college/IIIrd_sem/CricketVerse/.env.example) and [`backend/.env.example`](/d:/college/IIIrd_sem/CricketVerse/backend/.env.example) as templates.

Local defaults:

- Scraper points to `http://localhost:3001`
- Backend listens on `3001`
- MongoDB uses `mongodb://localhost:27017/CricketVerse`

## Daily Workflow

1. Start MongoDB locally.
2. Start the backend:

```bash
cd backend
node backend.js
```

3. Run the scraper from the project root:

```bash
python Scraping/Scraper.py
```

`Scraping/Scraper.py` is now a thin launcher. The active API implementation lives in [api_source.py](/d:/college/IIIrd_sem/CricketVerse/Scraping/api_source.py).

4. Start the frontend and verify against the local backend.

## Fixture Mode

Fixture mode lets you test the scraper and UI using saved API responses.

Sample fixture:

- [sample_matches.json](/d:/college/IIIrd_sem/CricketVerse/Scraping/fixtures/sample_matches.json)

To use it, set this in the root `.env`:

```env
CRICKET_DATA_SOURCE=fixture
```

Then run:

```bash
python Scraping/Scraper.py
```

The scraper will load the sample JSON instead of making a live API request.

## Validation Commands

```bash
python -m unittest discover Scraping/tests
python -m compileall Scraping/Scraper.py Scraping/api_source.py
cd backend && node --check backend.js
cd frontend && npm run build
```
