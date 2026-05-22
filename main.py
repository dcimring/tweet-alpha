#!/usr/bin/env python3
import os
import sys
import json
import time
import sqlite3
import subprocess
import argparse
import requests
from datetime import datetime, timedelta
from dotenv import load_dotenv
from litellm import completion, completion_cost

# Load environment variables
load_dotenv()

DB_NAME = "tweets.db"

def init_db():
    """Initialize the SQLite database schema if it does not exist."""
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS processed_tweets (
            tweet_id TEXT PRIMARY KEY,
            username TEXT,
            text TEXT,
            tickers TEXT,
            signal TEXT,
            processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tracker_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            tweets_processed INTEGER,
            model_used TEXT,
            total_input_tokens INTEGER,
            total_output_tokens INTEGER,
            total_cost REAL
        )
    """)
    conn.commit()
    conn.close()

def save_run_record(tweets_processed, model_used, total_input_tokens, total_output_tokens, total_cost):
    """Record a run execution's metadata in the local SQLite database."""
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO tracker_runs (tweets_processed, model_used, total_input_tokens, total_output_tokens, total_cost)
        VALUES (?, ?, ?, ?, ?)
        """,
        (tweets_processed, model_used, total_input_tokens, total_output_tokens, total_cost)
    )
    conn.commit()
    conn.close()

def is_tweet_processed(tweet_id):
    """Check if a tweet ID has already been processed."""
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM processed_tweets WHERE tweet_id = ?", (tweet_id,))
    row = cursor.fetchone()
    conn.close()
    return row is not None

def save_processed_tweet(tweet_id, username, text, tickers, signal):
    """Record a processed tweet and its extraction results in the local cache."""
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    # Serialize tickers list to comma-separated string
    tickers_str = ", ".join(tickers) if tickers else ""
    cursor.execute(
        "INSERT INTO processed_tweets (tweet_id, username, text, tickers, signal) VALUES (?, ?, ?, ?, ?)",
        (tweet_id, username, text, tickers_str, signal)
    )
    conn.commit()
    conn.close()

def extract_json(stdout_str):
    """Robustly extracts JSON from standard output, ignoring any leading/trailing warnings."""
    first_brace = stdout_str.find('{')
    first_bracket = stdout_str.find('[')
    
    start_idx = -1
    if first_brace != -1 and first_bracket != -1:
        start_idx = min(first_brace, first_bracket)
    elif first_brace != -1:
        start_idx = first_brace
    elif first_bracket != -1:
        start_idx = first_bracket
        
    if start_idx == -1:
        raise ValueError("No JSON object or array found in stdout.")
        
    last_brace = stdout_str.rfind('}')
    last_bracket = stdout_str.rfind(']')
    
    end_idx = -1
    if last_brace != -1 and last_bracket != -1:
        end_idx = max(last_brace, last_bracket)
    elif last_brace != -1:
        end_idx = last_brace
    elif last_bracket != -1:
        end_idx = last_bracket
        
    if end_idx == -1 or end_idx < start_idx:
        raise ValueError("Incomplete JSON structure in stdout.")
        
    return json.loads(stdout_str[start_idx:end_idx+1])

def fetch_tweets(list_id):
    """Invoke bird CLI to read the list timeline as JSON."""
    env = os.environ.copy()
    
    # Inject Twitter credentials if present in the dotenv configurations
    auth_token = os.getenv("TWITTER_AUTH_TOKEN")
    ct0 = os.getenv("TWITTER_CT0")
    if auth_token:
        env["AUTH_TOKEN"] = auth_token
    if ct0:
        env["CT0"] = ct0

    cmd = ["bird", "list-timeline", str(list_id), "--json"]
    print(f"Executing: {' '.join(cmd)}")
    
    # Run the bird subprocess
    result = subprocess.run(cmd, env=env, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"Error executing bird CLI (code {result.returncode}):", file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        raise RuntimeError("bird CLI command failed.")
        
    return extract_json(result.stdout)

def extract_tweet_info(tweet):
    """Safely extracts key fields from the bird JSON tweet schema."""
    tweet_id = tweet.get("id") or tweet.get("id_str") or tweet.get("rest_id")
    if not tweet_id and "legacy" in tweet:
        tweet_id = tweet["legacy"].get("id_str") or tweet["legacy"].get("id")
    
    text = (
        tweet.get("text") or 
        tweet.get("fullText") or 
        tweet.get("full_text") or
        tweet.get("body")
    )
    if not text and "legacy" in tweet:
        text = tweet["legacy"].get("full_text") or tweet["legacy"].get("text")
    if not text and "note_tweet" in tweet:
        text = tweet["note_tweet"].get("text")
        
    user_handle = None
    user_obj = tweet.get("author") or tweet.get("user")
    if user_obj:
        user_handle = user_obj.get("username") or user_obj.get("screen_name") or user_obj.get("screenName")
    
    if not user_handle and "core" in tweet:
        try:
            user_handle = tweet["core"]["user_results"]["result"]["legacy"]["screen_name"]
        except (KeyError, TypeError):
            pass
            
    return {
        "id": str(tweet_id) if tweet_id else None,
        "text": text or "",
        "username": user_handle or "unknown"
    }

def clean_grok_response(response_text):
    """Clean markdown backticks or block markers from a model response."""
    text = response_text.strip()
    if text.startswith("```"):
        newline_idx = text.find("\n")
        if newline_idx != -1:
            text = text[newline_idx:]
        if text.endswith("```"):
            text = text[:-3]
    return text.strip()

def analyze_tweet_sentiment(api_key, text):
    """Send tweet text to LiteLLM for ticker extraction and sentiment classification.
    Returns (analysis_dict, prompt_tokens, completion_tokens, call_cost)."""
    model = os.getenv("ACTIVE_MODEL", "xai/grok-4-1-fast-non-reasoning")
    
    system_prompt = (
        "You are an expert financial analyst. Analyze the user's tweet and return a JSON object.\n\n"
        "1. Extract all stock and crypto tickers mentioned (e.g. BTC, SOL, TSLA). If none are found, return an empty array [].\n"
        "2. Classify the sentiment signal as exactly one of: 'buy', 'sell', 'bullish', 'bearish', 'neutral'.\n\n"
        "CRITICAL CLASSIFICATION RULES:\n"
        "- 'buy': Use ONLY if the poster explicitly states they are actively executing a trade, entering, or adding to a position "
        "(e.g., 'bought some', 'adding spot here', 'filled orders', 'going long', 'accumulating').\n"
        "- 'sell': Use ONLY if the poster explicitly states they are executing a trade to exit or short a position "
        "(e.g., 'sold', 'took profit', 'shorting', 'exited').\n"
        "- 'bullish': Use if the poster has a positive view, technical breakout, or target price, but does NOT explicitly state they executed a trade.\n"
        "- 'bearish': Use if the poster has a negative view, chart breakdown, or downside target, but does NOT explicitly state they executed a trade.\n"
        "- 'neutral': Use for general news, discussion, or updates with no clear directional bias.\n\n"
        "FEW-SHOT EXAMPLES:\n"
        "- Tweet: 'Added some spot $BB at $6.13' -> Signal: 'buy'\n"
        "- Tweet: 'BTC looks primed for a breakout to 100k soon' -> Signal: 'bullish'\n"
        "- Tweet: 'Exited my Solana position entirely' -> Signal: 'sell'\n"
        "- Tweet: 'ETH is looking weak, expect further downside' -> Signal: 'bearish'\n\n"
        "Format the output strictly as raw JSON with keys 'tickers' (array of strings) and 'signal' (string).\n"
        "Do not include markdown blocks or any text outside of the raw JSON."
    )
    
    response = completion(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Analyze this tweet: \"{text}\""}
        ]
    )
    
    content = response.choices[0].message.content
    cleaned_content = clean_grok_response(content)
    
    usage = response.get("usage", {})
    prompt_tokens = usage.get("prompt_tokens", 0)
    completion_tokens = usage.get("completion_tokens", 0)
    
    try:
        from genai_prices import calc_price, Usage
        genai_usage = Usage(input_tokens=prompt_tokens, output_tokens=completion_tokens)
        price_calc = calc_price(usage=genai_usage, model_ref=model)
        call_cost = float(price_calc.total_price)
    except Exception:
        try:
            call_cost = completion_cost(completion_response=response) or 0.0
        except Exception:
            # Fallback to 0.0 cost if the model is brand new or unmapped
            call_cost = 0.0
    
    return json.loads(cleaned_content), prompt_tokens, completion_tokens, call_cost

def send_discord_alert(webhook_url, username, tweet_id, text, tickers, signal):
    """Send a rich embed message to a Discord webhook for high-importance (buy/sell) signals."""
    color = 0x00FF00 if signal.lower() == "buy" else 0xFF0000 # Green for buy, Red for sell
    
    embed = {
        "title": f"🚨 TWEET SIGNAL: {signal.upper()}",
        "description": text,
        "color": color,
        "fields": [
            {"name": "Twitter User", "value": f"@{username}", "inline": True},
            {"name": "Tickers Extracted", "value": ", ".join(tickers) if tickers else "None", "inline": True},
            {"name": "Source Link", "value": f"[View Tweet on X](https://x.com/{username}/status/{tweet_id})", "inline": False}
        ],
        "footer": {"text": "Tweet Alpha Tracker — Live Alerts"}
    }
    
    payload = {"embeds": [embed]}
    try:
        r = requests.post(webhook_url, json=payload, timeout=10)
        r.raise_for_status()
        print(f"Discord alert sent successfully for @{username} ({signal})!")
    except Exception as e:
        print(f"Error sending Discord alert: {e}", file=sys.stderr)

def run_tracker(list_id, api_key, webhook_url):
    """Query, filter, analyze, cache, and dispatch new list tweets."""
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n--- [{now_str}] Checking X List {list_id} ---")
    try:
        raw_tweets = fetch_tweets(list_id)
    except Exception as e:
        print(f"Failed to fetch tweets: {e}", file=sys.stderr)
        return

    # bird CLI can return an array or an object containing { tweets }
    tweets = []
    if isinstance(raw_tweets, dict) and "tweets" in raw_tweets:
        tweets = raw_tweets["tweets"]
    elif isinstance(raw_tweets, list):
        tweets = raw_tweets
    else:
        print("Unexpected bird CLI output format.", file=sys.stderr)
        return

    unprocessed_tweets = []
    for raw in tweets:
        parsed = extract_tweet_info(raw)
        if not parsed["id"]:
            continue
        if not is_tweet_processed(parsed["id"]):
            unprocessed_tweets.append(parsed)

    model = os.getenv("ACTIVE_MODEL", "xai/grok-4-1-fast-non-reasoning")

    if not unprocessed_tweets:
        print("No new tweets to process.")
        save_run_record(
            tweets_processed=0,
            model_used=model,
            total_input_tokens=0,
            total_output_tokens=0,
            total_cost=0.0
        )
        return

    print(f"Found {len(unprocessed_tweets)} new tweet(s) to process. Running Grok reasoning analysis...")
    
    # Print the table header
    header = f"{'TWITTER HANDLE':<18} | {'TICKERS':<12} | {'SIGNAL':<8} | {'TWEET PREVIEW'}"
    print(header)
    print("-" * len(header))

    total_prompt_tokens = 0
    total_completion_tokens = 0
    total_cost = 0.0
    successful_processed_count = 0

    for item in unprocessed_tweets:
        tweet_id = item["id"]
        username = item["username"]
        text = item["text"]
        
        try:
            # Perform sentiment analysis using LiteLLM
            analysis, p_tokens, c_tokens, call_cost = analyze_tweet_sentiment(api_key, text)
            total_prompt_tokens += p_tokens
            total_completion_tokens += c_tokens
            total_cost += call_cost
            
            tickers = analysis.get("tickers", [])
            signal = analysis.get("signal", "neutral").lower()
            
            # Print to local CLI console table
            preview = text.replace('\n', ' ')[:50] + "..." if len(text) > 50 else text.replace('\n', ' ')
            tickers_display = ", ".join(tickers) if tickers else "None"
            print(f"@{username:<17} | {tickers_display:<12} | {signal:<8} | {preview}")
            
            # Cache results in local SQLite database
            save_processed_tweet(tweet_id, username, text, tickers, signal)
            successful_processed_count += 1
            
            # Dispatch alerts for buy & sell signals
            if signal in ["buy", "sell"] and webhook_url:
                send_discord_alert(webhook_url, username, tweet_id, text, tickers, signal)
                
        except Exception as e:
            print(f"Error processing tweet {tweet_id} by @{username}: {e}", file=sys.stderr)
            # Do NOT cache in db if analysis failed, so we can retry next time

    # Save run record to database
    save_run_record(
        tweets_processed=successful_processed_count,
        model_used=model,
        total_input_tokens=total_prompt_tokens,
        total_output_tokens=total_completion_tokens,
        total_cost=total_cost
    )

    if unprocessed_tweets:
        print("\n" + "=" * 65)
        print("                    API USAGE & COST SUMMARY")
        print("=" * 65)
        print(f"Input Tokens:  {total_prompt_tokens:<10,}")
        print(f"Output Tokens: {total_completion_tokens:<10,}")
        print(f"Total Cost:    ${total_cost:.6f} (dynamic lookup)")
        print("=" * 65)

def main():
    parser = argparse.ArgumentParser(description="Tweet Alpha Tracker")
    parser.add_argument("--once", action="store_true", help="Run once and exit instead of looping every hour")
    args = parser.parse_args()

    # Load configuration
    list_id = os.getenv("TWITTER_LIST_ID")
    api_key = os.getenv("XAI_API_KEY")
    webhook_url = os.getenv("DISCORD_WEBHOOK_URL")

    if not list_id:
        print("Error: TWITTER_LIST_ID is not defined in the environment variables.", file=sys.stderr)
        sys.exit(1)

    if not api_key:
        print("Error: XAI_API_KEY is not defined in the environment variables.", file=sys.stderr)
        sys.exit(1)

    init_db()

    if args.once:
        run_tracker(list_id, api_key, webhook_url)
        print("Single execution completed. Exiting.")
    else:
        print("Tweet Alpha Tracker daemon starting... (Press Ctrl+C to exit)")
        while True:
            try:
                run_tracker(list_id, api_key, webhook_url)
            except Exception as e:
                print(f"Error in execution loop: {e}", file=sys.stderr)
            
            next_run = datetime.now() + timedelta(hours=1)
            next_run_str = next_run.strftime("%Y-%m-%d %H:%M:%S")
            print(f"Sleeping for 1 hour... (Next run at: {next_run_str})")
            try:
                time.sleep(3600)
            except KeyboardInterrupt:
                print("\nDaemon terminated by user. Exiting.")
                break

if __name__ == "__main__":
    main()
