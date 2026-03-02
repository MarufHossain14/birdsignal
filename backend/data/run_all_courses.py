import json
import subprocess
from pathlib import Path
import sys

catalog_path = Path("../../frontend/public/data/course-catalog/normalized.json")
catalog = json.loads(catalog_path.read_text())
codes = [row["code"] for row in catalog if row.get("code")]

cmd = [
    sys.executable,
    "course_details_analyzer.py",
    "--api-url", "http://localhost:3001",
    "--limit", "25",
    "--output-dir", "processed/course_details",
    "--course-codes",
    *codes,
]
subprocess.run(cmd, check=True)
print(f"Analyzed {len(codes)} courses.")
