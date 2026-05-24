#!/usr/bin/env python3
import os
import sys
import sqlite3
from dotenv import load_dotenv
from convex import ConvexClient

# Load environment variables
load_dotenv()

DB_NAME = "tweets.db"
CONVEX_URL = os.getenv("CONVEX_URL")

def migrate():
    if not CONVEX_URL:
        print("Error: CONVEX_URL is not set in your .env file.")
        print("Please ensure your Convex backend is running and CONVEX_URL is configured.")
        sys.exit(1)
        
    if not os.path.exists(DB_NAME):
        print(f"Error: Local SQLite database '{DB_NAME}' not found.")
        sys.exit(1)

    print(f"Connecting to Convex deployment at: {CONVEX_URL}")
    client = ConvexClient(CONVEX_URL)

    # Connect to local SQLite database
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()

    # 1. Migrate processed_tweets
    print("\n[1/2] Fetching existing processed_tweets from SQLite...")
    try:
        cursor.execute("SELECT tweet_id, username, text, tickers, signal, processed_at FROM processed_tweets")
        tweets_rows = cursor.fetchall()
    except sqlite3.OperationalError as e:
        print(f"No processed_tweets table found or error: {e}")
        tweets_rows = []

    if tweets_rows:
        print(f"Found {len(tweets_rows)} tweets in SQLite. Migrating to Convex...")
        tweets_data = []
        for row in tweets_rows:
            tweets_data.append({
                "tweetId": str(row[0]),
                "username": row[1] or "unknown",
                "text": row[2] or "",
                "tickers": row[3] or "",
                "signal": row[4] or "neutral",
                "processedAt": str(row[5]) if row[5] else None
            })
        
        # Batch upload to avoid hitting rate limits or call overhead
        try:
            secret_key = os.getenv("BACKEND_SECRET_KEY", "")
            client.mutation("tweets:bulkInsertTweets", {"secretKey": secret_key, "tweets": tweets_data})
            print(f"Successfully migrated {len(tweets_rows)} processed_tweets to Convex!")
        except Exception as e:
            print(f"Error migrating processed_tweets: {e}")
            sys.exit(1)
    else:
        print("No processed_tweets to migrate.")

    # 2. Migrate tracker_runs
    print("\n[2/2] Fetching existing tracker_runs from SQLite...")
    try:
        cursor.execute("SELECT tweets_processed, model_used, total_input_tokens, total_output_tokens, total_cost, timestamp FROM tracker_runs")
        runs_rows = cursor.fetchall()
    except sqlite3.OperationalError as e:
        print(f"No tracker_runs table found or error: {e}")
        runs_rows = []

    if runs_rows:
        print(f"Found {len(runs_rows)} tracker runs in SQLite. Migrating to Convex...")
        runs_data = []
        for row in runs_rows:
            runs_data.append({
                "tweetsProcessed": int(row[0] or 0),
                "modelUsed": row[1] or "unknown",
                "totalInputTokens": int(row[2] or 0),
                "totalOutputTokens": int(row[3] or 0),
                "totalCost": float(row[4] or 0.0),
                "timestamp": str(row[5]) if row[5] else None
            })
        
        try:
            secret_key = os.getenv("BACKEND_SECRET_KEY", "")
            client.mutation("runs:bulkInsertRuns", {"secretKey": secret_key, "runs": runs_data})
            print(f"Successfully migrated {len(runs_rows)} tracker_runs to Convex!")
        except Exception as e:
            print(f"Error migrating tracker_runs: {e}")
            sys.exit(1)
    else:
        print("No tracker runs to migrate.")

    conn.close()
    print("\nMigration completed successfully! 🎉")

if __name__ == "__main__":
    migrate()
