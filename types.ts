export const CONDITION_LEVELS = ['최상', '상', '중', '하'] as const;

export type ConditionLevel = (typeof CONDITION_LEVELS)[number];

export type OfferSource = 'ALADIN_API' | 'WEB_CRAWLER' | 'AMAZON_CRAWLER';
export type OriginalSourceMode = 'ALADIN_ONLY' | 'AMAZON_ONLY' | 'BOTH';
export type AmazonUsedConditionLevel = 'LIKE_NEW' | 'VERY_GOOD' | 'GOOD' | 'ACCEPTABLE';
export type DecisionAction = 'BUY_USED' | 'BUY_NEW' | 'WAIT';
export type MarketSignal = 'BUY_NOW' | 'WAIT' | 'HOLD';
export type ScarcityLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ParsedQuery {
  id: string;
  raw: string;
  normalized: string;
}

export interface BookIdentityOverride {
  title?: string;
  author?: string;
  isbn13?: string;
}

export interface UserPreferences {
  priceWeight: number;
  conditionWeight: number;
  shippingWeight: number;
  trustWeight: number;
  minCondition: ConditionLevel;
  strictCondition: boolean;
  includeUsed: boolean;
  includeNew: boolean;
  includeOriginalEditions: boolean;
  originalOnly: boolean;
  originalSourceMode: OriginalSourceMode;
  includeOriginalNew: boolean;
  minOriginalUsedConditionAladin: ConditionLevel;
  minOriginalUsedConditionAmazon: AmazonUsedConditionLevel;
  maxTotalPrice: number | null;
  maxShippingDays: number | null;
  downgradeSavingsThreshold: number;
}

export interface Offer {
  itemId?: number;
  id: string;
  queryId: string;
  queryTitle: string;
  normalizedQueryTitle: string;
  matchedTitle: string;
  normalizedMatchedTitle: string;
  author?: string;
  isbn13?: string;
  vendor: string;
  sellerName: string;
  source: OfferSource;
  condition: ConditionLevel;
  conditionConfidence: number;
  isUsed: boolean;
  price: number;
  shippingCost: number;
  shippingDays: number;
  trustScore: number;
  inStock: boolean;
  notes?: string;
  url?: string;
  coverUrl?: string;
  isOriginalEdition?: boolean;
  originalTitle?: string;
  amazonUsedCondition?: AmazonUsedConditionLevel;
  matchConfidence: number;
  crawledAt: string;
}

export interface WeightedContributions {
  price: number;
  condition: number;
  shipping: number;
  trust: number;
  penalty: number;
}

export interface ScoreBreakdown {
  offerId: string;
  totalScore: number;
  normalizedMetrics: {
    price: number;
    condition: number;
    shipping: number;
    trust: number;
  };
  weightedContributions: WeightedContributions;
  penalties: string[];
}

export interface PricePoint {
  label: string;
  averagePrice: number;
}

export interface PriceForecast {
  history: PricePoint[];
  expectedChangePct: number;
  signal: MarketSignal;
  scarcity: ScarcityLevel;
  reason: string;
}

export interface BookDecision {
  queryId: string;
  queryTitle: string;
  queryNormalized: string;
  matchedTitle: string;
  author?: string;
  isbn13?: string;
  coverUrl?: string;
  appliedOverride?: BookIdentityOverride;
  action: DecisionAction;
  confidence: number;
  reasoning: string[];
  tradeoffs: string[];
  risks: string[];
  fallbackMessage?: string;
  offers: Offer[];
  consideredOffers: Offer[];
  recommendedOfferId?: string;
  scoreBreakdown: ScoreBreakdown[];
  priceForecast: PriceForecast;
}

export interface BundleItemSelection {
  queryId: string;
  queryTitle: string;
  matchedTitle: string;
  isbn13?: string;
  offerId: string;
  vendor: string;
  sellerName: string;
  sellerKey: string;
  source: OfferSource;
  url?: string;
  price: number;
  shippingCost: number;
  bundledShippingCost: number;
  shippingNote?: string;
  totalPrice: number;
}

export interface BundleCandidate {
  rank: number;
  items: BundleItemSelection[];
  subtotal: number;
  shipping: number;
  total: number;
  vendorsUsed: string[];
  savingsVsBest: number;
}

export interface BundleOptimization {
  items: BundleItemSelection[];
  subtotal: number;
  shipping: number;
  total: number;
  savingsVsIndividual: number;
  vendorsUsed: string[];
  rationale: string[];
  candidates: BundleCandidate[];
}

export interface DecisionResult {
  requestedAt: string;
  queries: ParsedQuery[];
  decisions: BookDecision[];
  bundleOptimization?: BundleOptimization;
  globalWarnings: string[];
}

export interface SearchExecutionStats {
  requestCount: number;
  sourceStats: {
    aladinApiOffers: number;
    crawlerOffers: number;
    amazonOffers: number;
  };
}
