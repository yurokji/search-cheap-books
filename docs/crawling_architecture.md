
# Crawling Architecture — Aladin / YES24 / Amazon

Last updated: 2026-02-19

## Goals

- Reliable ingestion of listings
- Respect rate limits
- Detect price changes
- Handle anti-bot measures

## Components

- Scheduler
- Crawl workers
- Site adapters
- Parser layer
- Change detector
- Storage

## Flow

Scheduler → Queue → Workers → Adapter → Parser → DB

## Anti-Detection

- Rotating headers
- Backoff strategy
- Crawl windows
- Adaptive throttling

## Data Freshness

- Hot titles: frequent crawl
- Cold titles: periodic crawl

## Failure Handling

- Retry with jitter
- Dead letter queue
