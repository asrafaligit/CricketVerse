
import requests
import pymongo
from datetime import datetime

# Constants
API_KEY = "QL9VKVZYSDGSNWB767MLPZUZT&contentType=json"
MONGO_URI = "mongodb://localhost:27017/"
DB_NAME = "cricketdb"
COLLECTION_NAME = "matches"

# Connect to MongoDB
client = pymongo.MongoClient(MONGO_URI)
db = client[DB_NAME]
collection = db[COLLECTION_NAME]

# Fetch matches with upcoming dates
upcoming_matches = collection.find({
    "date": {"$gte": datetime.today()}
})

def get_weather(city, date, api_key):
    url = f"https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/{city}/{date}?key={api_key}"
    response = requests.get(url)
    if response.status_code != 200:
        print(f"Failed to fetch weather for {city} on {date}: {response.text}")
        return None
    
    data = response.json()
    day = data["days"][0]
    weather = {
        "temp": day.get("temp"),
        "humidity": day.get("humidity"),
        "wind_speed": day.get("windspeed"),
        "conditions": day.get("conditions"),
        "cloudcover": day.get("cloudcover")
    }
    return weather

# Process each match
for match in upcoming_matches:
    city = match.get("city") or match.get("venue")  # fallback to venue
    match_date = match["date"].strftime("%Y-%m-%d")
    
    weather_data = get_weather(city, match_date, API_KEY)
    if weather_data:
        print(f"📍 {city} | 📅 {match_date} → 🌤️ {weather_data}")
        # You can also update the match document:
        # collection.update_one({"_id": match["_id"]}, {"$set": {"weather": weather_data}})
