"""Write server/openapi.json (the frontend's type source). Run after any schemas.py / router change: python export_openapi.py"""
import json
from pathlib import Path

import main

Path(__file__).with_name("openapi.json").write_text(json.dumps(main.app.openapi(), indent=1), encoding="utf-8")
print("openapi.json:", len(main.app.openapi()["paths"]), "paths")
