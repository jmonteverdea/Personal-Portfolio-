# garmin-pull

Garmin data for the weekly fat-loss check-in. Uses Garmin's official client, `garmin-connect-personal-api-python`.

## One-time setup

Python 3.12 or newer.

```bash
python3 -m venv .venv
.venv/bin/pip install garmin-connect-personal-api-python
```

Save your Personal API key in `~/.config/garmin/connect-personal-api-key` (the key only, nothing else), then lock it down:

```bash
chmod 600 ~/.config/garmin/connect-personal-api-key
```

Or set the env var `GARMIN_PERSONAL_API_KEY` instead. Never put the key in this folder.

## Weekly check-in

```bash
.venv/bin/python checkin.py
```

Compares the 7 full days ending yesterday with the week before and a 4-week baseline, against four targets: 7,000 steps a day, 75 vigorous minutes a week, 3 weigh-ins a week, 7 hours of sleep. Ends with one action for the week. The email text lands in `output/checkin.txt`, subject on the first line. Targets live at the top of `checkin.py`.

Add `--dashboard output/dashboard` to also write the dashboard's data files (90 days of daily rows, activities, weigh-ins, fitness age).

## Raw pull

```bash
.venv/bin/python pull_week.py
```

One CSV row per day plus the raw JSON, for the 7 days ending yesterday. Use `--days 14` or `--end 2026-11-01` to change the window.

Columns: steps, calories (total, active, resting), resting HR, stress, intensity minutes (moderate, vigorous), body battery, floors, sleep (hours, deep, REM, score), HRV and its status, weight, and the day's activities.

## Files

- `garmin_data.py`: fetching and shaping. Range calls in 28-day chunks; sleep is one call a night because its range call is refused.
- `checkin.py`: weekly email and dashboard files.
- `pull_week.py`: raw CSV and JSON.

## Notes

- A 401 triggers one token refresh and one retry. If it fails again, run `.venv/bin/gc-personal refresh-token` and check the key.
- Days with no data get blank cells. They do not stop the run.
- `output/` is git-ignored because it holds personal health data.
