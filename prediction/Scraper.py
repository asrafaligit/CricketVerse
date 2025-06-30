import requests
import time
from bs4 import BeautifulSoup
from fake_useragent import UserAgent
import hashlib


TEAM_NAME_MAP = {
    "IND": "India",
    "AUS": "Australia",
    "ENG": "England",
    "PAK": "Pakistan",
    "WI": "West Indies",
    "SA": "South Africa",
    "SL": "Sri Lanka",
    "BAN": "Bangladesh",
    "IRE": "Ireland",
    "SCOT": "Scotland",
    "NZ": "New Zealand",
    "ZIM": "Zimbabwe",
    "AFG": "Afghanistan",
    "NED": "Netherlands",
    "NEP": "Nepal",
}

def get_full_team_name(short_name):
    return TEAM_NAME_MAP.get(short_name.upper(), short_name)


def fetch_with_retry(url, headers, retries=3):
    for i in range(retries):
        try:
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 200:
                return response
        except Exception as e:
            print(f"Retry {i + 1} failed: {e}")
            time.sleep(2 ** i)
    return None

def send_data_to_server(data):
    try:
        response = requests.post("http://localhost:3001/save-data", json=data)
        if response.status_code == 200:
            print("✅ Data sent successfully.")
        else:
            print(f"❌ Failed to send data. Status code: {response.status_code}")
    except Exception as e:
        print(f"🚨 Error sending data: {e}")

def parse_live_card(card):
    status_tag = card.find("span", class_="ds-text-tight-xs ds-font-bold ds-uppercase ds-leading-5")
    status = status_tag.text.strip().upper() if status_tag else "UNKNOWN"

    team_tags = card.find_all("div", class_="ds-flex ds-items-center ds-min-w-0 ds-mr-1")
    team1_short  = team_tags[0].text.strip() if len(team_tags) > 0 else "N/A"
    team2_short  = team_tags[1].text.strip() if len(team_tags) > 1 else "N/A"
    team1 = get_full_team_name(team1_short)
    team2 = get_full_team_name(team2_short)

    score_tags = card.find_all("div", class_="ds-text-compact-s ds-text-typo ds-text-right ds-whitespace-nowrap")
    score1 = score_tags[0].text.strip() if len(score_tags) > 0 else "N/A"
    score2 = score_tags[1].text.strip() if len(score_tags) > 1 else "Yet to bat"

    result_tag = card.find("p", class_="ds-text-tight-s ds-font-medium ds-truncate ds-text-typo")
    result = result_tag.text.strip() if result_tag else "In Progress"

    match_link_tag = card.find("a", href=True)
    match_page_url = "https://www.espncricinfo.com" + match_link_tag["href"] if match_link_tag else None

     # 🟩 Extract venue and date from span next to status
    match_format, venue, date = "N/A", "N/A", "N/A    "
    venue_date_span = card.find("span", class_="ds-flex ds-items-center")
    if venue_date_span:
        parts = [p.strip() for p in venue_date_span.text.split(",")]
        if len(parts) >= 3:
            match_format = parts[0]
            venue = parts[1]
            date = parts[2]

    return status, team1, team2, score1, score2, result, match_page_url,match_format, venue, date

def get_scorecard_url_from_match_page(match_page_url, headers):
    resp = fetch_with_retry(match_page_url, headers)
    if not resp:
        print("❌ Failed to fetch match page.")
        return None
    soup = BeautifulSoup(resp.content, "html.parser")
    scorecard_link = soup.find("a", href=True, string="Scorecard")
    return "https://www.espncricinfo.com" + scorecard_link["href"] if scorecard_link else None

def parse_scorecard_data(scorecard_url, headers):
    resp = fetch_with_retry(scorecard_url, headers)
    if not resp:
        return {}, {}

    soup = BeautifulSoup(resp.content, "html.parser")

    def get_meta(label):
        span = soup.find("span", string=label)
        return span.find_next("span").text.strip() if span and span.find_next("span") else "N/A"

    toss = get_meta("Toss")
    potm = get_meta("Player Of The Match")

    run_rate = "N/A"
    rr_divs = soup.find_all("div", class_="ds-text-tight-s")
    for div in rr_divs:
        if "RR" in div.text or "Run Rate" in div.text:
            run_rate = div.text.strip()
            break

    innings_divs = soup.find_all("div", class_="ds-p-0")
    innings_data = {}

    innings_processed = 0
    for i in range(1, len(innings_divs)):
        if innings_processed >= 2:
            break
        tables = innings_divs[i].find_all("table")
        if len(tables) < 2:
            continue

        inning_key = f"inning_{innings_processed + 1}"
        innings_data[inning_key] = {"batting": [], "bowling": []}

        for row in tables[0].find_all("tr")[1:]:
            cols = row.find_all("td")
            if len(cols) >= 8:
                innings_data[inning_key]["batting"].append({
                    "name": cols[0].text.strip(),
                    "diss_summary": cols[1].text.strip(),
                    "runs": cols[2].text.strip(),
                    "balls": cols[3].text.strip(),
                    "fours": cols[5].text.strip(),
                    "sixes": cols[6].text.strip(),
                    "strike_rate": cols[7].text.strip()
                })

        for row in tables[1].find_all("tr")[1:]:
            cols = row.find_all("td")
            if len(cols) >= 6:
                innings_data[inning_key]["bowling"].append({
                    "name": cols[0].text.strip(),
                    "diss_summary": cols[1].text.strip(),
                    "overs": cols[2].text.strip(),
                    "maidens": cols[3].text.strip(),
                    "runs_conceded": cols[4].text.strip(),
                    "wickets": cols[5].text.strip(),
                    "economy": cols[6].text.strip()
                })

        innings_processed += 1

    match_info = {
        "toss": toss,
        "player_of_the_match": potm,
        "current_run_rate": run_rate
    }

    return match_info, innings_data

def generate_match_id(team1, team2, date, venue):
    unique_string = f"{team1}-{team2}-{date}-{venue}"
    return hashlib.md5(unique_string.encode()).hexdigest()


def main():
    ua = UserAgent()
    headers = {"User-Agent": ua.random}
    base_url = "https://www.espncricinfo.com/live-cricket-score"

    while True:
        response = fetch_with_retry(base_url, headers)
        if not response:
            print("❌ Main page fetch failed.")
            time.sleep(10)
            continue

        soup = BeautifulSoup(response.content, "html.parser")
        cards = soup.find_all("div", class_="ds-px-4 ds-py-3")

        all_data = []

        for card in cards[:3]:  # Limit to first 3 cards
            try:
                status, team1, team2, score1, score2, result, match_page_url,match_format, venue, date = parse_live_card(card)
                match_id = generate_match_id(team1, team2, date, venue)

                if not match_page_url:
                    continue

                scorecard_url = get_scorecard_url_from_match_page(match_page_url, headers)
                if not scorecard_url:
                    continue

                match_info, innings_data = parse_scorecard_data(scorecard_url, headers)

                match_data = {
                    "match_id": match_id,
                    "status": status,
                    "team1": team1,
                    "team2": team2,
                    "score1": score1,
                    "score2": score2,
                    "match_result": result,
                    "match_url": scorecard_url,
                    "match_format": match_format,
                    "venue": venue,
                    "date": date,
                    "toss": match_info.get("toss", "N/A"),
                    "player_of_the_match": match_info.get("player_of_the_match", "N/A"),
                    "current_run_rate": match_info.get("current_run_rate", "N/A"),
                    "inning_1": innings_data.get("inning_1", {}),
                    "inning_2": innings_data.get("inning_2", {})
                }

                all_data.append(match_data)
            except Exception as e:
                print(f"🚨 Error processing match: {e}")
        
        if all_data:
            send_data_to_server(all_data)
        else:
            print("⚠️ No matches processed.")

        time.sleep(20)

if __name__ == "__main__":
    main()
