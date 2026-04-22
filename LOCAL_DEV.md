# Local Development

## Services

Main app:

```bash
cd backend
node backend.js
```

Frontend:

```bash
cd frontend
npm start
```

Optional prediction service:

```bash
cd prediction
python predict_server.py
```

Optional toss advisor service:

```bash
cd prediction
python decision_advisor.py
```

## Fixture Mode

To avoid spending live API credits during testing, set:

```env
CRICKET_DATA_SOURCE=fixture
```

The backend will then use:

- [sample_matches.json](/d:/college/IIIrd_sem/CricketVerse/Scraping/fixtures/sample_matches.json)

## Validation

```bash
cd backend && node --check backend.js
cd frontend && npm run build
```

## Important

- Live match fetching now happens in `backend/backend.js`
- `Scraping/api_source.py` is legacy support code, not the active backend refresh path
