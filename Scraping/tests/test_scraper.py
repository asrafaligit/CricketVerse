import json
import os
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

from Scraping import api_source as scraper


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SAMPLE_FIXTURE_PATH = PROJECT_ROOT / "Scraping" / "fixtures" / "sample_matches.json"


class ScraperWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with SAMPLE_FIXTURE_PATH.open("r", encoding="utf-8") as fixture_file:
            cls.fixture_payload = json.load(fixture_file)

    def test_get_backend_url_prefers_explicit_backend_api_url(self):
        with patch.dict(
            os.environ,
            {"BACKEND_API_URL": "http://localhost:3001", "PORT": "9999"},
            clear=True,
        ):
            self.assertEqual(scraper.get_backend_url(), "http://localhost:3001")

    def test_normalize_match_builds_expected_summary(self):
        match = self.fixture_payload["data"][0]

        normalized = scraper.normalize_match(match, "fixture:sample_matches.json")

        self.assertEqual(normalized["match_id"], "sample-match-001")
        self.assertEqual(normalized["status"], "LIVE")
        self.assertEqual(normalized["team1"], "India")
        self.assertEqual(normalized["team2"], "Australia")
        self.assertEqual(normalized["score1"], "182/6 (20)")
        self.assertEqual(normalized["score2"], "159/5 (17)")
        self.assertEqual(normalized["series"], "Bilateral T20 Series")
        self.assertEqual(
            normalized["source_endpoint"], "fixture:sample_matches.json"
        )
        self.assertEqual(len(normalized["score_breakdown"]), 2)

    def test_load_fixture_response_reads_sample_payload(self):
        payload = scraper.load_fixture_response(SAMPLE_FIXTURE_PATH)

        self.assertIsNotNone(payload)
        self.assertEqual(payload["data"][1]["id"], "sample-match-002")

    def test_select_priority_matches_picks_today_yesterday_tomorrow_first(self):
        selected = scraper.select_priority_matches(
            self.fixture_payload["data"],
            limit=3,
            reference_now=datetime(2026, 4, 21, 18, 0, 0),
        )

        self.assertEqual(
            [match["id"] for match in selected],
            ["sample-match-001", "sample-match-002", "sample-match-003"],
        )

    def test_select_priority_matches_balances_past_and_future_when_possible(self):
        matches = [
            self._build_match("today-match", "2026-04-21", "2026-04-21T14:00:00Z"),
            self._build_match(
                "tomorrow-match", "2026-04-22", "2026-04-22T14:00:00Z"
            ),
            self._build_match(
                "future-match", "2026-04-23", "2026-04-23T14:00:00Z"
            ),
            self._build_match("past-match", "2026-04-19", "2026-04-19T14:00:00Z"),
        ]

        selected = scraper.select_priority_matches(
            matches,
            limit=3,
            reference_now=datetime(2026, 4, 21, 18, 0, 0),
        )

        self.assertEqual(
            [match["id"] for match in selected],
            ["today-match", "tomorrow-match", "past-match"],
        )

    def test_select_priority_matches_uses_nearest_future_when_only_future_exists(self):
        matches = [
            self._build_match("future-1", "2026-04-22", "2026-04-22T14:00:00Z"),
            self._build_match("future-2", "2026-04-23", "2026-04-23T14:00:00Z"),
            self._build_match("future-3", "2026-04-24", "2026-04-24T14:00:00Z"),
            self._build_match("future-4", "2026-04-25", "2026-04-25T14:00:00Z"),
        ]

        selected = scraper.select_priority_matches(
            matches,
            limit=3,
            reference_now=datetime(2026, 4, 21, 18, 0, 0),
        )

        self.assertEqual(
            [match["id"] for match in selected],
            ["future-1", "future-2", "future-3"],
        )

    def _build_match(self, match_id, match_date, match_datetime):
        return {
            "id": match_id,
            "name": f"{match_id} name",
            "matchType": "t20",
            "status": "Scheduled",
            "venue": "Sample Venue",
            "date": match_date,
            "dateTimeGMT": match_datetime,
            "teams": ["India", "Australia"],
            "teamInfo": [
                {"name": "India", "shortname": "IND", "img": ""},
                {"name": "Australia", "shortname": "AUS", "img": ""},
            ],
            "score": [],
            "t1": "India",
            "t2": "Australia",
            "t1s": "",
            "t2s": "",
            "matchStarted": False,
            "matchEnded": False,
            "ms": "fixture",
            "series": "Sample Series",
        }


if __name__ == "__main__":
    unittest.main()
