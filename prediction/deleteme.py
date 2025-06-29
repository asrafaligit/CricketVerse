import requests
import time
from fake_useragent import UserAgent
from bs4 import BeautifulSoup  # Assuming you will parse HTML with this

def fetch_with_retry(url, headers, retries=3):
    for i in range(retries):
        try:
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 200:
                return response
        except requests.exceptions.RequestException:
            print(f"Retrying... Attempt {i+1}")
            time.sleep(2 ** i)  # Exponential backoff
    return None

# Function to send data to Node.js server
def send_data_to_server(data):
    server_url = "http://localhost:3001/save-data"
    try:
        response = requests.post(server_url, json=data)
        if response.status_code == 200:
            print("Data saved to MatchData.json successfully.")
        else:
            print("Failed to save data to server.")
    except requests.exceptions.RequestException as e:
        print(f"Error sending data: {e}")

# Scraper loop
url = "https://www.espncricinfo.com/live-cricket-score"
headers = {"User-Agent": UserAgent().random}

while True:
    response = fetch_with_retry(url, headers)
    if response:
        soup = BeautifulSoup(response.content, "html.parser")
        
        status = soup.find_all("span", class_="ds-text-tight-xs ds-font-bold ds-uppercase ds-leading-5")  #Status of the match
        # print(status[0].text)
        matches = soup.find_all("span", class_="ds-flex ds-items-center")  #Title of the match
        for i in range(0,3):
            print(status[i].text)
            date_and_tour_name = soup.find_all("div", class_="ds-text-tight-xs ds-truncate ds-text-typo-mid3")  #Date and tour name
            print(date_and_tour_name[i].text)
            team_names = soup.find_all("div", class_="ds-flex ds-items-center ds-min-w-0 ds-mr-1")  
            print(team_names[0].text)
            print(team_names[1].text)
            scores = soup.find_all("div", class_="ds-text-compact-s ds-text-typo ds-text-right ds-whitespace-nowrap")  #Scores
            print(scores[0].text)
            print(scores[1].text)
            match_result = soup.find_all("p", class_="ds-text-tight-s ds-font-medium ds-truncate ds-text-typo")  #Result of the match
            print(match_result[i].text)
            scraped_data = []
            for data in url:
                
                data = {
                    "status": status[i].text,
                    "team1": team_names[0].text if team_names else "N/A",
                    "team2": team_names[1].text if len(team_names) > 1 else "N/A",
                    "score1": scores[0].text if scores else "N/A",
                    "score2": scores[1].text if len(scores) > 1 else "N/A",
                    "match_result": match_result[i].text,
                }
                scraped_data.append(data)

            print("Data fetched successfully.")
            
            # Send scraped data to the server
            send_data_to_server(scraped_data)
        else:
            print("Failed to fetch data after retries.")

    time.sleep(100)  # Fetch every minute