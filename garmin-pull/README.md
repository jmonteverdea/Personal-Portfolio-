# garmin-pull

Weekly Garmin pull for the fat-loss check-in. Uses Garmin's official client, `garmin-connect-personal-api-python`.

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

## Every week

```bash
cd garmin-pull
```

```bash
.venv/bin/gc-personal --quiet sleep --date "$(date +%F)"
```

```bash
.venv/bin/python pull_week.py
```

The first command moves into the folder. The second is a quick check that the key works. The third pulls the last 7 days. Use `--days 14` for two weeks.

Output lands in `output/`:

- `garmin_<start>_to_<end>.csv`: one row per day
- `garmin_<start>_to_<end>.json`: raw API responses, for anything the CSV leaves out

## Notes

- A 401 triggers one token refresh and one retry. If it fails again, run `.venv/bin/gc-personal refresh-token` and check the key.
- Days with no data get blank cells. They do not stop the run.
- `output/` is git-ignored because it holds personal health data.
