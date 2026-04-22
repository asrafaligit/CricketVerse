import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from Scraping.api_source import *  # noqa: F401,F403
from Scraping.api_source import main


if __name__ == "__main__":
    main()
