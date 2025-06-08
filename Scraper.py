import requests
import time
from fake_useragent import UserAgent
from bs4 import BeautifulSoup

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

def parse_live_card(match):
    st = match.find("span", class_="ds-text-tight-xs ds-font-bold ds-uppercase ds-leading-5")
    raw_status = st.text.strip() if st else "Unknown"
    status_keywords = ["LIVE", "RESULT", "STUMPS", "INNINGS BREAK"]
    status = raw_status.upper() if any(kw in raw_status.upper() for kw in status_keywords) else "UPCOMING"

    teams = match.find_all("div", class_="ds-flex ds-items-center ds-min-w-0 ds-mr-1")
    team1 = teams[0].find("p").text.strip() if teams and teams[0].find("p") else "N/A"
    team2 = teams[1].find("p").text.strip() if len(teams) > 1 and teams[1].find("p") else "N/A"

    scores = match.find_all("div", class_="ds-text-compact-s ds-text-typo ds-text-right ds-whitespace-nowrap")
    score1 = scores[0].text.strip() if scores else "N/A"
    score2 = scores[1].text.strip() if len(scores) > 1 else "Yet to bat"

    res = match.find("p", class_="ds-text-tight-s ds-font-medium ds-truncate ds-text-typo")
    result = res.text.strip() if res else "In Progress"

    return status, team1, team2, score1, score2, result

def parse_detail_page(soup):
    # Extract venue, date, league
    venue, date, league = "N/A", "N/A", "N/A"
    header_div = soup.find("div", class_="ds-text-tight-m ds-font-regular ds-text-typo-mid3")
    if header_div:
        parts = [part.strip() for part in header_div.text.strip().split(",")]
        if len(parts) >= 4:
            venue = parts[1]
            date = parts[2] + ", " + parts[3]
            league = ", ".join(parts[4:]) if len(parts) > 4 else "N/A"

    # Helper to find labeled span data
    def get_meta(label):
        span = soup.find("span", string=label)
        if span:
            next_span = span.find_next("span")
            return next_span.text.strip() if next_span else "N/A"
        return "N/A"

    toss = get_meta("Toss")
    potm = get_meta("Player Of The Match")

    # Parse batters
    player_rows = soup.find_all("tr", class_="ds-border-none")
    batters = []
    for row in player_rows[:2]:
        cols = [td.text.strip() for td in row.find_all("td")]
        if len(cols) >= 6:
            batters.append({
                "name":         cols[0],
                "runs":         cols[1],
                "balls":        cols[2],
                "fours":        cols[3],
                "sixes":        cols[4],
                "strike_rate":  cols[5]
            })

    # Parse bowlers
    bowlers = []
    for row in player_rows[2:4]:
        cols = [td.text.strip() for td in row.find_all("td")]
        if len(cols) >= 6:
            bowlers.append({
                "name":          cols[0],
                "overs":         cols[1],
                "maidens":       cols[2],
                "runs_conceded": cols[3],
                "wickets":       cols[4],
                "economy":       cols[5]
            })

    # Parse current run rate if available
    run_rate = "N/A"
    rr_divs = soup.find_all("div", class_="ds-text-tight-s ds-font-regular ds-truncate ds-text-typo")
    for div in rr_divs:
        if "RR" in div.text or "Run Rate" in div.text:
            run_rate = div.text.strip()
            break

    return venue, date, league, toss, potm, batters, bowlers, run_rate

def main():
    ua = UserAgent()
    headers = {"User-Agent": ua.random}
    live_url = "https://www.espncricinfo.com/live-cricket-score"

    while True:
        response = fetch_with_retry(live_url, headers)
        if not response: 
            print("❌ Failed to fetch main page.")
            time.sleep(10)
            continue

        soup = BeautifulSoup(response.content, "html.parser")
        cards = soup.find_all("div", class_="ds-px-4 ds-py-3")

        all_data = []
        for card in cards[:3]:  # scrape only first 3 matches for efficiency
            try:
                status, team1, team2, score1, score2, match_result = parse_live_card(card)

                link_tag = card.find("a", href=True)
                if not link_tag or not link_tag["href"].startswith("/"):
                    continue

                match_url = "https://www.espncricinfo.com" + link_tag["href"]
                detail_resp = fetch_with_retry(match_url, headers)
                if not detail_resp:
                    print(f"⚠️ Could not load detail page for {team1} vs {team2}")
                    continue

                detail_soup = BeautifulSoup(detail_resp.content, "html.parser")
                venue, date, league, toss, potm, batters, bowlers, run_rate = parse_detail_page(detail_soup)

                match_data = {
                    "status":               status,
                    "team1":                team1,
                    "team2":                team2,
                    "score1":               score1,
                    "score2":               score2,
                    "match_result":         match_result,
                    "match_url":            match_url,
                    "venue":                venue,
                    "date":                 date,
                    "league":               league,
                    "toss":                 toss,
                    "player_of_the_match":  potm,
                    "batters":              batters,
                    "bowlers":              bowlers,
                    "current_run_rate":     run_rate
                }

                all_data.append(match_data)

            except Exception as ex:
                print(f"⚠️ Error processing match card: {ex}")

        if all_data:
            print(f"📤 Sending {len(all_data)} match(es) to server...")
            send_data_to_server(all_data)
        else:
            print("🚨 No data to send this cycle.")

        time.sleep(10)

if __name__ == "__main__":
    main()
