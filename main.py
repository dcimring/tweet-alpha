#!/usr/bin/env python3
import os
import sys
import json
import time
from convex import ConvexClient
import subprocess
import argparse
import requests
import logging
from datetime import datetime, timedelta

# Suppress LiteLLM provider dependency warnings
logging.getLogger("LiteLLM").setLevel(logging.ERROR)

from dotenv import load_dotenv
from litellm import completion, completion_cost

# Load environment variables
load_dotenv()

CONVEX_URL = os.getenv("CONVEX_URL")
if not CONVEX_URL:
    print("Error: CONVEX_URL is not defined in the environment variables.", file=sys.stderr)
    sys.exit(1)

convex_client = ConvexClient(CONVEX_URL)

class BirdCredentialError(Exception):
    """Exception raised when xurl CLI fails due to missing or invalid credentials."""
    pass

def init_db():
    """No-op for Convex database since schema is declared in TypeScript."""
    pass

def save_run_record(tweets_processed, model_used, total_input_tokens, total_output_tokens, total_cost):
    """Record a run execution's metadata in the Convex database."""
    secret_key = os.getenv("BACKEND_SECRET_KEY", "")
    try:
        convex_client.mutation(
            "runs:saveRunRecord",
            {
                "secretKey": secret_key,
                "tweetsProcessed": tweets_processed,
                "modelUsed": model_used,
                "totalInputTokens": total_input_tokens,
                "totalOutputTokens": total_output_tokens,
                "totalCost": total_cost,
            }
        )
    except Exception as e:
        print(f"Error recording run in Convex: {e}", file=sys.stderr)

def is_tweet_processed(tweet_id):
    """Check if a tweet ID has already been processed in Convex."""
    try:
        return convex_client.query("tweets:isTweetProcessed", {"tweetId": str(tweet_id)})
    except Exception as e:
        print(f"Error querying Convex: {e}", file=sys.stderr)
        raise e

def check_processed_tweets(tweet_ids):
    """Check which tweet IDs in a list have already been processed in Convex in a single batch query."""
    try:
        return convex_client.query("tweets:checkProcessedTweets", {"tweetIds": [str(tid) for tid in tweet_ids]})
    except Exception as e:
        print(f"Error querying Convex checkProcessedTweets: {e}", file=sys.stderr)
        raise e

def save_processed_tweet(tweet_id, username, text, tickers, signal):
    """Record a processed tweet and its extraction results in Convex."""
    tickers_str = ", ".join(tickers) if tickers else ""
    secret_key = os.getenv("BACKEND_SECRET_KEY", "")
    try:
        convex_client.mutation(
            "tweets:saveProcessedTweet",
            {
                "secretKey": secret_key,
                "tweetId": str(tweet_id),
                "username": username,
                "text": text,
                "tickers": tickers_str,
                "signal": signal,
            }
        )
    except Exception as e:
        print(f"Error saving processed tweet in Convex: {e}", file=sys.stderr)
        raise e

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
    """Invoke xurl CLI to read the list timeline as JSON."""
    app_name = os.getenv("XURL_APP_NAME")
    if not app_name:
        raise RuntimeError("XURL_APP_NAME is not defined in the environment variables.")
    cmd = ["xurl", "--app", app_name, f"/2/lists/{list_id}/tweets?expansions=author_id&user.fields=username"]
    print(f"Executing: {' '.join(cmd)}")
    
    # Run the xurl subprocess
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"Error executing xurl CLI (code {result.returncode}):", file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        
        # Check if the error is due to credentials
        error_msg = (result.stderr or "") + "\n" + (result.stdout or "")
        if any(sig in error_msg.lower() for sig in ["401", "unauthorized", "invalid token", "expired", "credentials", "auth"]):
            raise BirdCredentialError(f"xurl credential error detected: {result.stderr.strip() if result.stderr else 'missing or invalid credentials'}")
            
        raise RuntimeError("xurl CLI command failed.")
        
    try:
        data = extract_json(result.stdout)
    except Exception as e:
        print(f"Failed to parse xurl JSON output: {e}", file=sys.stderr)
        raise e

    # Map the v2 API response to a flat list of tweet dicts
    tweets_list = []
    if isinstance(data, dict):
        tweets_data = data.get("data", [])
        includes = data.get("includes", {})
        users = includes.get("users", [])
        
        # Create map of author_id -> username
        users_map = {}
        for u in users:
            u_id = u.get("id")
            u_name = u.get("username")
            if u_id and u_name:
                users_map[str(u_id)] = u_name
                
        for tweet in tweets_data:
            tweet_id = tweet.get("id")
            text = tweet.get("text") or ""
            author_id = tweet.get("author_id")
            username = users_map.get(str(author_id), "unknown") if author_id else "unknown"
            tweets_list.append({
                "id": tweet_id,
                "text": text,
                "username": username
            })
            
    return tweets_list

def extract_tweet_info(tweet):
    """Safely extracts key fields from the tweet schema."""
    tweet_id = tweet.get("id")
    text = tweet.get("text")
    username = tweet.get("username")
            
    return {
        "id": str(tweet_id) if tweet_id else None,
        "text": text or "",
        "username": username or "unknown"
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
    
    max_retries = 5
    delay = 2
    response = None
    for attempt in range(1, max_retries + 1):
        try:
            response = completion(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Analyze this tweet: \"{text}\""}
                ]
            )
            break
        except Exception as e:
            class_name = type(e).__name__
            # Skip retrying for known non-transient error categories
            if "BadRequest" in class_name or "Authentication" in class_name or "InvalidRequest" in class_name:
                raise e
            if attempt == max_retries:
                raise e
            print(f"Warning: API call failed with {class_name} ({e}). Retrying in {delay}s... (Attempt {attempt}/{max_retries})", file=sys.stderr)
            time.sleep(delay)
            delay *= 2
    
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

def send_discord_credential_error_alert(webhook_url, error_message):
    """Send an alert to Discord notifying that xurl credentials have failed or expired."""
    app_name = os.getenv("XURL_APP_NAME", "your_xurl_app_name_here")
    embed = {
        "title": "❌ XURL CREDENTIALS ERROR",
        "description": f"The `xurl` CLI tool (app: `{app_name}`) encountered an authorization or credentials error when trying to fetch the list timeline.",
        "color": 0xFF9900, # Orange for warning/action required
        "fields": [
            {"name": "Error Details", "value": f"```\n{error_message[:1000]}\n```", "inline": False},
            {"name": "Action Required", "value": f"Run `xurl auth oauth2 --app {app_name}` in your terminal to complete the authorization flow again.", "inline": False}
        ],
        "footer": {"text": "Tweet Alpha Tracker — System Alert"}
    }
    payload = {"embeds": [embed]}
    try:
        r = requests.post(webhook_url, json=payload, timeout=10)
        r.raise_for_status()
        print("Discord credential error alert sent successfully!")
    except Exception as e:
        print(f"Error sending Discord credential error alert: {e}", file=sys.stderr)

def run_tracker(list_id, api_key, webhook_url):
    """Query, filter, analyze, cache, and dispatch new list tweets."""
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n--- [{now_str}] Checking X List {list_id} ---")
    try:
        raw_tweets = fetch_tweets(list_id)
    except BirdCredentialError as e:
        print(f"Failed to fetch tweets due to credentials: {e}", file=sys.stderr)
        if webhook_url:
            send_discord_credential_error_alert(webhook_url, str(e))
        else:
            print("Warning: DISCORD_WEBHOOK_URL is not configured, skipping Discord alert.", file=sys.stderr)
        return
    except Exception as e:
        print(f"Failed to fetch tweets: {e}", file=sys.stderr)
        return

    # xurl CLI can return an array or an object containing { tweets }
    tweets = []
    if isinstance(raw_tweets, dict) and "tweets" in raw_tweets:
        tweets = raw_tweets["tweets"]
    elif isinstance(raw_tweets, list):
        tweets = raw_tweets
    else:
        print("Unexpected xurl CLI output format.", file=sys.stderr)
        return

    unprocessed_tweets = []
    # Batch check which tweets are already processed to avoid expensive sequential queries
    tweet_ids = [str(raw.get("id")) for raw in tweets if isinstance(raw, dict) and raw.get("id")]
    if tweet_ids:
        try:
            processed_ids = set(check_processed_tweets(tweet_ids))
        except Exception as e:
            print(f"Warning: Batch check failed ({e}). Falling back to individual checks.", file=sys.stderr)
            processed_ids = None
    else:
        processed_ids = set()

    for raw in tweets:
        parsed = extract_tweet_info(raw)
        if not parsed["id"]:
            continue
        if processed_ids is not None:
            if parsed["id"] not in processed_ids:
                unprocessed_tweets.append(parsed)
        else:
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
    xurl_app = os.getenv("XURL_APP_NAME")

    if not list_id:
        print("Error: TWITTER_LIST_ID is not defined in the environment variables.", file=sys.stderr)
        sys.exit(1)

    if not api_key:
        print("Error: XAI_API_KEY is not defined in the environment variables.", file=sys.stderr)
        sys.exit(1)

    if not xurl_app:
        print("Error: XURL_APP_NAME is not defined in the environment variables.", file=sys.stderr)
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
            
            next_run = datetime.now() + timedelta(minutes=15)
            next_run_str = next_run.strftime("%Y-%m-%d %H:%M:%S")
            print(f"Sleeping for 15 minutes... (Next run at: {next_run_str})")
            try:
                time.sleep(900)
            except KeyboardInterrupt:
                print("\nDaemon terminated by user. Exiting.")
                break

if __name__ == "__main__":
    main()
