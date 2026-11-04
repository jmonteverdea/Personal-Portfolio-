"""Pull daily Garmin data to one CSV (one row per day) and one raw JSON file in output/.

By default it covers the 7 full days ending yesterday, since today is always partial.
"""

import argparse
import csv
import json
from datetime import date, timedelta
from pathlib import Path

from garmin_data import DAILY_COLUMNS, fetch, yesterday

OUTPUT_DIR = Path(__file__).parent / "output"


def main():
    parser = argparse.ArgumentParser(description="Pull daily Garmin data to CSV and JSON.")
    parser.add_argument("--days", type=int, default=7, help="number of days (default: 7)")
    parser.add_argument("--end", type=date.fromisoformat, default=yesterday(), help="last day, YYYY-MM-DD (default: yesterday)")
    args = parser.parse_args()
    if args.days < 1:
        parser.error("--days must be 1 or more")

    start = args.end - timedelta(days=args.days - 1)
    data = fetch(start, args.end)

    OUTPUT_DIR.mkdir(exist_ok=True)
    stem = f"garmin_{start}_to_{args.end}"
    csv_path, json_path = OUTPUT_DIR / f"{stem}.csv", OUTPUT_DIR / f"{stem}.json"
    with csv_path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=DAILY_COLUMNS)
        writer.writeheader()
        writer.writerows({k: ("" if v is None else v) for k, v in row.items()} for row in data["days"])
    json_path.write_text(json.dumps(data["raw"], indent=2))
    print(f"wrote {csv_path}\nwrote {json_path}")


if __name__ == "__main__":
    main()
