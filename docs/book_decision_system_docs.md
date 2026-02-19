
# Book Purchase Decision Intelligence System — Document Pack

_Last updated: 2026-02-19_

---

## 1. Product Vision

Build a decision intelligence system that:

- Finds books reliably by **title (fuzzy, multilingual, typo‑tolerant)** or ISBN
- Aggregates offers from multiple vendors (used + new)
- Computes optimal purchase strategy
- Makes trade‑offs explicit (price vs condition vs shipping vs trust)
- Provides a **single glance decision view**
- Allows user‑defined priorities
- Falls back to new book with configurable price ceiling when used unavailable

---

## 2. Core User Problem

Users currently:

- Manually search multiple marketplaces
- Compare prices mentally
- Miss better combinations
- Struggle when titles are ambiguous
- Have no clear decision framework

We replace manual comparison with structured intelligence.

---

## 3. Decision Model (High Level)

Decision score:

```
Score = w_price * normalized_price
      + w_condition * condition_score
      + w_shipping * shipping_time_score
      + w_trust * seller_trust_score
      + w_availability * availability_score
```

Weights configurable in UI.

System returns:

- Best single offer
- Best bundle strategy
- Pareto frontier (optional advanced view)

---

## 4. Priority Configuration

User can set:

- Cheapest possible
- Best condition
- Fastest delivery
- Trusted sellers only
- Balanced (default)

Advanced sliders:

- Max acceptable price
- Min condition grade
- Max shipping days
- Trust threshold

---

## 5. New Book Fallback Logic

If no used copy found:

1. Query new book sources
2. Apply user price ceiling
3. Recommend:

   - Buy new
   - Wait
   - Notify when used appears

Decision banner:

> “Used unavailable — best new option within budget”

---

## 6. Frontend UI Architecture

### Layout Zones

1. Search Bar (top — prominent)
2. Decision Summary Card (hero)
3. Priority Controls Panel
4. Offer Table
5. Insights Panel
6. Timeline / What‑if simulator

---

## 7. Single Glance Decision View

Decision Card shows:

- Recommended action
- Confidence score
- Reasoning bullets
- Price comparison delta
- Risk indicators

Example:

```
BUY FROM Seller A

✔ 18% cheaper than next option
✔ Condition: Very Good
✔ Delivery: 3 days
✔ Trust score high
```

---

## 8. Visual Signals

Use:

- Green = optimal
- Yellow = trade‑off
- Red = risk
- Blue = informational

Confidence meter (gauge).

---

## 9. Extendable UI Components

Component library:

- DecisionCard
- PrioritySlider
- OfferTable
- TradeoffChart
- ConfidenceGauge
- AlertBanner
- VendorBadge

Design system tokens:

- spacing scale
- typography scale
- semantic colors

---

## 10. Search Robustness Strategy

Pipeline:

1. Normalize title
2. Language detection
3. Fuzzy search
4. Alias database
5. ISBN inference
6. Candidate clustering
7. Confidence scoring

Handles:

- Typos
- Translations
- Subtitle variations
- Series naming differences

---

## 11. Backend Services

- Search Resolver
- Offer Aggregator
- Decision Engine
- Pricing Model
- Notification Service

---

## 12. Data Schema (Simplified)

Tables:

### Books
- id
- canonical_title
- isbn
- language
- aliases

### Offers
- id
- book_id
- vendor
- price
- condition
- shipping_days
- trust_score
- availability

### UserPreferences
- weights
- thresholds

---

## 13. Decision Intelligence Dashboard

Advanced mode shows:

- Tradeoff frontier chart
- Sensitivity analysis
- Scenario simulation

Example questions:

- What if I wait 2 weeks?
- What if price rises?
- What if condition relaxed?

---

## 14. Edge Cases

- Multiple editions
- Out of print
- Marketplace inconsistencies
- Partial listings
- Duplicate sellers

System clusters offers by edition.

---

## 15. Confidence Scoring

Confidence derived from:

- Data completeness
- Price variance
- Listing freshness
- Seller reliability

Shown visually.

---

## 16. Notifications

User can subscribe:

- Price drop alerts
- Used copy availability
- Better decision detected

---

## 17. MVP Scope

Include:

- Title search
- Offer aggregation
- Basic decision score
- Priority sliders
- Decision card
- New fallback

Exclude initially:

- Advanced simulation
- Multi‑book optimization
- Historical analytics

---

## 18. Future Extensions

- Bulk library purchasing
- Academic citation integration
- Collector mode
- Auction prediction
- AI negotiation agent

---

## 19. Success Metrics

- Decision time reduction
- Click‑through rate
- Purchase confidence
- Repeat usage
- Price savings

---

## 20. Philosophy

System should feel like:

> “A calm analytical advisor — not a price scraper.”

Clarity over complexity.

---
