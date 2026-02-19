
# System Architecture

```mermaid
flowchart LR

User --> WebUI
WebUI --> API

API --> SearchService
API --> DecisionEngine
API --> OfferAggregator

SearchService --> TitleResolver
OfferAggregator --> MarketAdapters

DecisionEngine --> ScoringModel

API --> Database
```
