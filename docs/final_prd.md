
# Book Purchase Decision Intelligence System — Final PRD

Last updated: 2026-02-19

---

## 1. Product Vision

Build a decision intelligence platform that helps users decide:

- Where to buy books
- Whether to buy used or new
- Which condition to accept
- Whether to wait or buy now
- How to optimize across multiple books

The system should feel like an analytical advisor, not a price scraper.

---

## 2. Core Objectives

- Reliable title-based search (no ISBN required)
- Aggregated marketplace offers
- Explicit decision recommendation
- User‑defined priority policies
- Condition‑aware optimization
- New book fallback
- Multi‑book optimization
- Explainable decisions

---

## 3. Users

Primary:

- Serious readers
- Collectors
- Researchers
- Budget‑conscious buyers

Secondary:

- Library purchasers
- Bulk buyers

---

## 4. Key Problems

- Manual comparison is tedious
- Listings inconsistent
- Condition unclear
- Price volatility unknown
- Tradeoffs hard to reason about

---

## 5. Core Features

### 5.1 Title Search

- Fuzzy matching
- Multilingual handling
- Alias resolution
- Edition clustering
- Confidence scoring

### 5.2 Offer Aggregation

Sources:

- Aladin
- YES24
- Amazon
- Additional vendors via adapters

---

### 5.3 Condition Handling

Condition scale:

- 최상
- 상
- 중
- 하

Capabilities:

- Minimum condition filter
- Condition priority weighting
- Downgrade path configuration
- Strict vs flexible modes

---

### 5.4 Decision Policies

User can choose:

- Lowest price
- Condition first
- Balanced
- Custom weights

Options include:

- Accept downgrade if savings threshold met
- Reject below condition
- Escalation strategy

---

### 5.5 New Book Fallback

If acceptable used copy unavailable:

- Recommend new
- Respect price ceiling
- Notify when used appears
- Wait option

---

### 5.6 Decision Intelligence Engine

Produces:

- Recommended action
- Confidence score
- Reasoning
- Tradeoffs
- Risk indicators

---

### 5.7 Explainability

System explains:

- Why recommendation chosen
- Condition tradeoffs
- Price comparisons
- Policy impact

---

### 5.8 Price Prediction

Outputs:

- Expected price trajectory
- Buy now vs wait signal
- Scarcity indicator

---

### 5.9 Condition Inference

NLP analyzes seller descriptions to infer:

- Wear
- Notes
- Damage
- Missing pages

Produces condition confidence.

---

### 5.10 Multi‑Book Optimization

Goal:

- Minimize total cost including shipping

Considers:

- Seller bundling
- Shipping tiers
- Inventory overlap

---

## 6. UX Principles

- Ultra low cognitive load
- Single clear recommendation
- Progressive disclosure
- Calm visual hierarchy

Key views:

- Decision summary
- Policy controls
- Offer table
- Insights panel

---

## 7. System Architecture

Components:

- Web UI
- API layer
- Search resolver
- Offer aggregator
- Decision engine
- Price model
- NLP inference
- Database
- Worker queues

---

## 8. Crawling Strategy

- Adaptive scheduling
- Change detection
- Rate limit compliance
- Backoff policies
- Data freshness tiers

---

## 9. Data Model

Core entities:

- Books
- Aliases
- Editions
- Offers
- Sellers
- User preferences
- Price history

---

## 10. Decision Model

Utility combines:

- Price
- Condition
- Shipping time
- Seller trust
- Availability
- Policy constraints

Supports hard constraints and soft scoring.

---

## 11. Notifications

- Price drop
- Better decision detected
- Condition availability
- New listing alerts

---

## 12. Production Infrastructure

- Queue system
- Distributed workers
- Cache layer
- Rate limiter
- Observability
- Auto scaling

---

## 13. Reliability

- Retry strategies
- Circuit breakers
- Dead letter queues
- Data validation

---

## 14. Security

- Credential isolation
- Vendor compliance
- Abuse prevention

---

## 15. Metrics

- Decision clarity score
- User trust
- Conversion rate
- Price savings
- Search success rate

---

## 16. MVP Scope

Include:

- Title search
- Offer aggregation
- Condition policies
- Decision recommendation
- New fallback
- Basic explainability

---

## 17. Future Enhancements

- Personalized preference learning
- Auction prediction
- Collector mode
- Vendor marketplace plugins
- Advanced simulations

---

## 18. Success Criteria

- Users trust recommendations
- Reduced decision time
- Meaningful savings
- High retention

---

## 19. Philosophy

The product should answer:

“Given my priorities, what should I do?”

with clarity and confidence.

---
