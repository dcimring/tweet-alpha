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
- **Credential Failure Detection**: If the subprocess execution returns a non-zero exit code, the wrapper scans `stdout` and `stderr` for credential-related signatures (e.g. `HTTP 401`, `Could not authenticate`, `Missing credentials`, or missing tokens warnings). If detected, it raises a custom `BirdCredentialError` exception to trigger a warning dispatch.

### B. Database Layer (SQLite)
- **File**: `tweets.db`
- **Tables**:
  - `processed_tweets`: Caches tweets and extraction results.
    - **Schema**:
      - `tweet_id` (TEXT, PRIMARY KEY): Used to uniquely identify the tweet and prevent duplicate processing.
      - `username` (TEXT): The Twitter handle of the poster.
      - `text` (TEXT): The body of the tweet.
      - `tickers` (TEXT): Comma-separated list of identified tickers.
      - `signal` (TEXT): Classification of the tweet (one of `buy`, `sell`, `bullish`, `bearish`, `neutral`).
      - `processed_at` (TIMESTAMP): Automatically records the processing date and time.
  - `tracker_runs`: Records execution metrics for each tracker run.
    - **Schema**:
      - `id` (INTEGER, PRIMARY KEY AUTOINCREMENT): Unique row identifier.
      - `timestamp` (TIMESTAMP): Automatically records when the run occurred.
      - `tweets_processed` (INTEGER): Number of new tweets successfully processed during the run.
      - `model_used` (TEXT): The model name used for sentiment classification (e.g. `xai/grok-4-1-fast-non-reasoning`).
      - `total_input_tokens` (INTEGER): Total prompt tokens consumed during the run.
      - `total_output_tokens` (INTEGER): Total completion tokens consumed during the run.
      - `total_cost` (REAL): Total execution cost in USD.

### C. Sentiment Analysis & Extraction (LiteLLM Wrapper)
- **Multi-Model Integration**: Invokes a dynamic model via LiteLLM specified by `ACTIVE_MODEL` in the environment configuration (e.g., `xai/grok-4-1-fast-non-reasoning`, `gemini/gemini-2.5-flash`).
- **Dynamic Cost Tracking**: Uses `genai-prices` first to calculate precise USD execution costs dynamically per run using exact, updated market pricing databases. Falls back to LiteLLM's internal `completion_cost()` and finally `0.0` if the target model is unmapped in the `genai-prices` database.
- **Prompt Specification**: Commands the selected model to perform financial analysis, extract any stock/crypto symbols, and return a clean, unadorned JSON object containing keys:
  - `"tickers"`: List of upper-case strings (e.g. `["BTC", "SOL"]`)
  - `"signal"`: Sentiment classification string (`"buy"`, `"sell"`, `"bullish"`, `"bearish"`, or `"neutral"`)
- **Error Retries & Resilience**: The completion call wraps LiteLLM requests in a robust retry handler with exponential backoff (up to 5 attempts, starting at 2 seconds). Known permanent exceptions (e.g. invalid API key or bad request) bypass retries, while transient network issues, 503 Service Unavailable, and 429 Rate Limit conditions are automatically retried to ensure reliability.
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
- **Credential Failure Alerts**: If the wrapper detects a credentials error, it dispatches an orange embed alert (`0xFF9900`) detailing the specific failure logs to the configured Discord Webhook to prompt credential renewal.

### F. Model Cost Viewer Utility (`model_costs.py`)
- **Purpose**: A standalone command-line tool to inspect and compare token pricing (input and output costs) across diverse LLMs supported by LiteLLM.
- **Features**:
  - Dynamically extracts pricing metadata from `genai-prices` snapshot database first for absolute accuracy.
  - Falls back to `litellm.model_cost` internal pricing if `genai-prices` lookup fails.
  - Formats costs per **1 million tokens** for easy visualization.
  - Displays context window sizes (Max Tokens).
  - Groups/filters by provider, searches by model substring, and sorts dynamically.
  - Includes a curated list of top models for primary providers by default.

---

## 3. Data Flow Execution Sequence

1. **Initialization**:
   - Loads `.env` file configurations.
   - Initialises the local SQLite database.
2. **Fetch Phase**:
   - Executes the `bird` list-timeline command.
   - Decodes stdout from JSON bytes to an array of tweet objects.
   - Scans output for credentials issues; if a credentials error is found, raises `BirdCredentialError`, sends a system alert embed to the Discord webhook, and gracefully aborts the current run.
3. **Filter Phase**:
   - Queries `tweets.db` for each tweet ID.
   - Keeps only tweets not already recorded in the database.
4. **Analysis & Storage Phase**:
   - For each unprocessed tweet, invokes the configured LLM through LiteLLM (with automatic retries for transient errors).
   - Parses the JSON response.
   - Inserts the record into SQLite to ensure it is never processed again.
   - Prints a row in the console terminal table.
   - If the signal is `buy` or `sell`, dispatches the Discord embed immediately.
5. **Scheduler**:
   - If executed in daemon mode (default), sleeps for 3600 seconds (1 hour) before restarting the flow.
   - If executed with `--once`, shuts down cleanly.
