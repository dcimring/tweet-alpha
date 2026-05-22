# Architecture - Tweet Alpha Tracker

This document details the system design, execution flow, data storage, and external integrations for the **Tweet Alpha Tracker** application.

---

## 1. System Overview

The Tweet Alpha Tracker is a lightweight automated tool that reads tweets from a designated Twitter list, filters for new tweets, extracts stock/crypto tickers, and classifies investment sentiment (signals) using the xAI Grok API. For high-priority signals (`buy` and `sell`), rich embed alerts are dispatched to a Discord webhook.

```mermaid
graph TD
    A[Timer / Loop / CLI Trigger] --> B[Fetch List Timeline via bird CLI]
    B --> C[Parse Tweets JSON]
    C --> D[Filter Unprocessed Tweets via SQLite]
    D -->|New Tweets Only| E[Analyze Sentiment via LiteLLM]
    E --> F[Extract Ticker & Signal]
    F --> G[Save Tweet & Results to SQLite]
    F --> H[Show Consolidated Console Table]
    F -->|Signal is BUY/SELL| I[Dispatch Rich Discord Webhook Embed]
```

---

## 2. Component Breakdown

### A. Scraper / Fetcher (`bird` CLI Wrapper)
- **Tool**: The application invokes the external Node-based `@steipete/bird` CLI tool using Python's `subprocess` module.
- **Arguments**: Runs `bird list-timeline <LIST_ID> --json`.
- **Session Auth**: Since system-level sandboxing can prevent automatic browser cookie reading, the wrapper forwards `TWITTER_AUTH_TOKEN` and `TWITTER_CT0` from the `.env` file via `AUTH_TOKEN` and `CT0` environment variables to the subprocess.
- **Robust JSON Parsing**: Safely extracts the tweet ID, tweet text, and author handle across several legacy and modern GraphQL shapes that the bird output may render.

### B. Database Layer (SQLite)
- **File**: `tweets.db`
- **Table**: `processed_tweets`
- **Schema**:
  - `tweet_id` (TEXT, PRIMARY KEY): Used to uniquely identify the tweet and prevent duplicate processing.
  - `username` (TEXT): The Twitter handle of the poster.
  - `text` (TEXT): The body of the tweet.
  - `ticker` (TEXT): Comma-separated list of identified tickers.
  - `signal` (TEXT): Classification of the tweet (one of `buy`, `sell`, `bullish`, `bearish`, `neutral`).
  - `processed_at` (TIMESTAMP): Automatically records the processing date and time.

### C. Sentiment Analysis & Extraction (LiteLLM Wrapper)
- **Multi-Model Integration**: Invokes a dynamic model via LiteLLM specified by `ACTIVE_MODEL` in the environment configuration (e.g., `xai/grok-4-1-fast-non-reasoning`, `gemini/gemini-2.5-flash`).
- **Dynamic Cost Tracking**: Calls built-in `completion_cost()` on completion responses to query model pricing metadata and calculate EXACT USD execution costs dynamically per run.
- **Prompt Specification**: Commands the selected model to perform financial analysis, extract any stock/crypto symbols, and return a clean, unadorned JSON object containing keys:
  - `"tickers"`: List of upper-case strings (e.g. `["BTC", "SOL"]`)
  - `"signal"`: Sentiment classification string (`"buy"`, `"sell"`, `"bullish"`, `"bearish"`, or `"neutral"`)
- **JSON Sanitization**: Robustly strips markdown wrappers (such as ```json) before passing results to the JSON parser.

### D. Console Output
- Renders a clean, tabular layout using Python's native f-strings to display:
  - Twitter handle (prefixed with `@`)
  - Identified tickers
  - Signal (sentiment classification)
  - Text preview (first 40 characters)

### E. Alert Dispatcher (Discord Webhooks)
- When a `buy` or `sell` signal is extracted, an alert is transmitted to the configured Discord Webhook.
- Uses color-coded embeds:
  - **Green (`0x00FF00`)**: For `buy` signals.
  - **Red (`0xFF0000`)**: For `sell` signals.
- Includes fields detailing the poster, tickers, tweet content, and a direct clickable URL back to the tweet on X.

---

## 3. Data Flow Execution Sequence

1. **Initialization**:
   - Loads `.env` file configurations.
   - Initialises the local SQLite database.
2. **Fetch Phase**:
   - Executes the `bird` list-timeline command.
   - Decodes stdout from JSON bytes to an array of tweet objects.
3. **Filter Phase**:
   - Queries `tweets.db` for each tweet ID.
   - Keeps only tweets not already recorded in the database.
4. **Analysis & Storage Phase**:
   - For each unprocessed tweet, calls the Grok API.
   - Parses the JSON response from Grok.
   - Inserts the record into SQLite to ensure it is never processed again.
   - Prints a row in the console terminal table.
   - If the signal is `buy` or `sell`, dispatches the Discord embed immediately.
5. **Scheduler**:
   - If executed in daemon mode (default), sleeps for 3600 seconds (1 hour) before restarting the flow.
   - If executed with `--once`, shuts down cleanly.
