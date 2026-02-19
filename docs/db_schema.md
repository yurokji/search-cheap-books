
# DB Schema

## books
- id
- canonical_title
- isbn
- language

## aliases
- id
- book_id
- alias

## offers
- id
- book_id
- vendor
- price
- condition (최상/상/중/하)
- shipping_days
- trust_score
- availability

## user_preferences
- id
- weight_price
- weight_condition
- weight_shipping
- weight_trust
- min_condition
- max_price
