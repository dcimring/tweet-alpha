# Tweet Alpha Tracker

A lightweight, automated Python application that monitors a specific Twitter list, extracts crypto and stock tickers from new tweets, classifies investment sentiment (signals), displays a real-time console table, and sends instant alerts to a Discord webhook for high-importance signals (`buy` and `sell`).

---

## Features

- **Duplicate Prevention**: Keeps track of already processed tweets in a local SQLite database (`tweets.db`).
- **Grok Sentiment Analysis**: Uses the high-performance xAI `grok-4-1-fast-reasoning` API to extract stock and crypto symbols and classify them as `buy`, `sell`, `bullish`, `bearish`, or `neutral`.
- **Discord Alerts**: Instantly dispatches rich, color-coded embed cards (Green for `buy`, Red for `sell`) to your Discord channel.
- **Robust Twitter Scraper**: Integrates with the `@steipete/bird` CLI, passing credentials securely from your environment variables.
- **Flexible Execution Modes**: Run once (perfect for test runs or cron jobs) or run as a daemon loop that checks every hour.

---

## Architecture Flow

```
[Timer / CLI Trigger]
         │
         ▼
[Fetch List Timeline via bird CLI]
         │
         ▼
[Filter Unprocessed Tweets via SQLite]
         │
         ▼
[Analyze with grok-4-1-fast-reasoning]
         │
         ▼
 ┌───────┴───────┐
 ▼               ▼
[Save to DB]   [Print Console Table]
                 │
                 ▼ (if Signal is BUY/SELL)
               [Send Discord Webhook Embed]
```

---

## Installation & Setup

### 1. Clone the Repository & Setup venv
Create a Python virtual environment and install the minimal dependencies:
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure Environment Variables
Copy `.env.template` to a new file named `.env` and fill in your keys:
```bash
cp .env.template .env
```

Open `.env` and configure:
```ini
TWITTER_LIST_ID=your_twitter_list_id_here
XAI_API_KEY=your_xai_api_key_here
DISCORD_WEBHOOK_URL=your_discord_webhook_url_here

# Optional: Add these if bird CLI requires session cookie overrides
TWITTER_AUTH_TOKEN=your_auth_token_here
TWITTER_CT0=your_ct0_here
```

---

## How to Run

### Run Once (Test Pass / Cron Job)
Runs a single timeline fetch and sentiment check, then exits cleanly:
```bash
venv/bin/python main.py --once
```

### Run as a Daemon (Hourly Loop)
Runs the tracker, caches results, and automatically sleeps for 1 hour before checking again:
```bash
venv/bin/python main.py
```
*(Press `Ctrl+C` to terminate the daemon.)*

---

## Project Structure

- `main.py`: Main application code containing SQLite database handlers, bird wrapper, Grok API client, and Discord webhook integration.
- `architecture.md`: Inside-out detailed technical architecture reference document.
- `requirements.txt`: Python package dependencies.
- `.gitignore`: Specifying untracked local caches, virtual environments, and secrets.
- `tweets.db`: SQLite database caching processed tweet IDs (automatically generated on first run).
