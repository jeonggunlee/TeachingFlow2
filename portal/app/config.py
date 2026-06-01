import os
from dotenv import load_dotenv

load_dotenv()

CREATELECTURE_URL          = os.getenv("CREATELECTURE_URL",          "http://localhost:8000")
PLAYLECTURE_URL            = os.getenv("PLAYLECTURE_URL",            "http://localhost:8001")
PLAYLECTURE_ADMIN_PASSWORD = os.getenv("PLAYLECTURE_ADMIN_PASSWORD", "changeme")
ANALYZELECTURE_URL         = os.getenv("ANALYZELECTURE_URL",         "http://localhost:8002")
