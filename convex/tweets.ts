import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

declare const process: any;

// Check if a tweet has already been processed by querying the by_tweetId index
export const isTweetProcessed = query({
  args: { tweetId: v.string() },
  handler: async (ctx, args) => {
    const tweet = await ctx.db
      .query("processed_tweets")
      .withIndex("by_tweetId", (q) => q.eq("tweetId", args.tweetId))
      .unique();
    return tweet !== null;
  },
});

// Save a processed tweet into the database, avoiding duplicates
export const saveProcessedTweet = mutation({
  args: {
    secretKey: v.string(),
    tweetId: v.string(),
    username: v.string(),
    text: v.string(),
    tickers: v.string(),
    signal: v.string(),
    processedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.secretKey !== process.env.BACKEND_SECRET_KEY) {
      throw new Error("Unauthorized: Invalid backend secret key.");
    }
    const existing = await ctx.db
      .query("processed_tweets")
      .withIndex("by_tweetId", (q) => q.eq("tweetId", args.tweetId))
      .unique();
    if (existing !== null) {
      return;
    }
    await ctx.db.insert("processed_tweets", {
      tweetId: args.tweetId,
      username: args.username,
      text: args.text,
      tickers: args.tickers,
      signal: args.signal,
      processedAt: args.processedAt || new Date().toISOString(),
    });
  },
});

// Bulk insert tweets (primarily used for data migration)
export const bulkInsertTweets = mutation({
  args: {
    secretKey: v.string(),
    tweets: v.array(
      v.object({
        tweetId: v.string(),
        username: v.string(),
        text: v.string(),
        tickers: v.string(),
        signal: v.string(),
        processedAt: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    if (args.secretKey !== process.env.BACKEND_SECRET_KEY) {
      throw new Error("Unauthorized: Invalid backend secret key.");
    }
    for (const tweet of args.tweets) {
      const existing = await ctx.db
        .query("processed_tweets")
        .withIndex("by_tweetId", (q) => q.eq("tweetId", tweet.tweetId))
        .unique();
      if (existing === null) {
        await ctx.db.insert("processed_tweets", {
          ...tweet,
          processedAt: tweet.processedAt || new Date().toISOString(),
        });
      }
    }
  },
});

// Query to get recent processed tweets
export const getRecentTweets = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("processed_tweets")
      .order("desc")
      .take(limit);
  },
});

// Query to get stats about processed tweets
export const getTweetStats = query({
  args: {},
  handler: async (ctx) => {
    const recent = await ctx.db
      .query("processed_tweets")
      .order("desc")
      .take(1000);

    const signalCounts: Record<string, number> = {};
    const tickerCounts: Record<string, number> = {};

    for (const t of recent) {
      signalCounts[t.signal] = (signalCounts[t.signal] || 0) + 1;
      if (t.tickers) {
        const list = t.tickers.split(",").map((s) => s.trim().toUpperCase());
        for (const ticker of list) {
          if (ticker) {
            tickerCounts[ticker] = (tickerCounts[ticker] || 0) + 1;
          }
        }
      }
    }

    return {
      totalProcessedSample: recent.length,
      signalCounts,
      tickerCounts,
    };
  },
});

