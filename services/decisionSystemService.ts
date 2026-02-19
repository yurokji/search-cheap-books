import {
  BUNDLE_FRIENDLY_VENDORS,
  CONDITION_DISPLAY_LABEL,
  CONDITION_SCORE,
  SOURCE_LABELS,
  VENDOR_TRUST_BASELINE,
  clamp,
  formatCurrency,
  isConditionAtLeast,
  normalizeTitle,
  normalizeWeights,
  safeNumber,
} from '../constants';
import { inferCondition } from './conditionInference';
import {
  extractAladinUsedChannels,
  lookupAladinItemByIsbn13,
  lookupAladinItemByItemId,
  searchAladinItems,
} from './aladinService';
import { fetchAmazonOffers } from './amazonService';
import { fetchCrawledOffers } from './crawlerService';
import { computeTitleMatchConfidence, isExactTitleMatch } from './titleResolver';
import { resolveOriginalTitleFallback } from './originalTitleFallbackService';
import {
  BookDecision,
  BookIdentityOverride,
  BundleItemSelection,
  BundleOptimization,
  ConditionLevel,
  DecisionResult,
  Offer,
  AmazonUsedConditionLevel,
  ParsedQuery,
  PricePoint,
  ScoreBreakdown,
  SearchExecutionStats,
  UserPreferences,
} from '../types';

const generateId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

const hashString = (value: string): number => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return hash >>> 0;
};

const seededRandom = (seed: number): (() => number) => {
  let state = seed || 1;
  return () => {
    state = Math.imul(1103515245, state) + 12345;
    return ((state >>> 0) % 10000) / 10000;
  };
};

const splitQueryTokens = (input: string): string[] => {
  const tokens: string[] = [];
  let buffer = '';
  let depth = 0;

  for (const ch of input) {
    if (ch === '(' || ch === '[' || ch === '{') {
      depth += 1;
      buffer += ch;
      continue;
    }

    if (ch === ')' || ch === ']' || ch === '}') {
      depth = Math.max(0, depth - 1);
      buffer += ch;
      continue;
    }

    const isSeparator = ch === ',' || ch === '，' || ch === '\n' || ch === ';';
    if (isSeparator && depth === 0) {
      const token = buffer.trim();
      if (token) tokens.push(token);
      buffer = '';
      continue;
    }

    buffer += ch;
  }

  const lastToken = buffer.trim();
  if (lastToken) tokens.push(lastToken);
  return tokens;
};

const stripTrailingMetadata = (token: string): string => {
  const trimmed = token.trim();
  if (!trimmed) return trimmed;

  const match = trimmed.match(/^(.*?)[\s]*\(([^()]*)\)\s*$/);
  if (!match) return trimmed;

  const titleOnly = match[1]?.trim();
  return titleOnly || trimmed;
};

const parseQueries = (input: string): ParsedQuery[] => {
  const rawTokens = splitQueryTokens(input);

  const seen = new Set<string>();
  const parsed: ParsedQuery[] = [];

  for (const token of rawTokens) {
    const title = stripTrailingMetadata(token);
    const normalized = normalizeTitle(title);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    parsed.push({ id: generateId('query'), raw: title, normalized });
  }

  return parsed;
};

const TITLE_MATCH_THRESHOLD = 0.45;
const AMAZON_USED_CONDITION_PRIORITY: Record<AmazonUsedConditionLevel, number> = {
  LIKE_NEW: 4,
  VERY_GOOD: 3,
  GOOD: 2,
  ACCEPTABLE: 1,
};
const DEFAULT_JPY_KRW_RATE = safeNumber(import.meta.env.VITE_JPY_KRW_RATE, 9.2);

const normalizeAmazonUsedCondition = (
  conditionText: string | undefined,
  fallbackCondition: ConditionLevel,
): AmazonUsedConditionLevel => {
  const text = (conditionText ?? '').toLowerCase();

  if (text.includes('like new') || text.includes('새것 같은')) return 'LIKE_NEW';
  if (text.includes('very good') || text.includes('매우 좋은')) return 'VERY_GOOD';
  if (text.includes('acceptable') || text.includes('그럭저럭')) return 'ACCEPTABLE';
  if (text.includes('good') || text.includes('좋은 상태')) return 'GOOD';
  if (text.includes('ほぼ新品')) return 'LIKE_NEW';
  if (text.includes('非常に良い')) return 'VERY_GOOD';
  if (text.includes('良い')) return 'GOOD';
  if (text.includes('可')) return 'ACCEPTABLE';

  if (fallbackCondition === '최상') return 'LIKE_NEW';
  if (fallbackCondition === '상') return 'VERY_GOOD';
  if (fallbackCondition === '중') return 'GOOD';
  return 'ACCEPTABLE';
};
const normalizeCoverUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  return url.replace(/^http:\/\//i, 'https://');
};

const normalizeIsbn13 = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const normalized = value.replace(/[^0-9Xx]/g, '');
  return normalized.length >= 10 ? normalized.toUpperCase() : undefined;
};

interface ShippingPolicy {
  freeShippingThreshold: number | null;
  bundleAdditionalRate: number;
  minAdditionalShipping: number;
}

const DEFAULT_SHIPPING_POLICY: ShippingPolicy = {
  freeShippingThreshold: null,
  bundleAdditionalRate: 1,
  minAdditionalShipping: 0,
};

const VENDOR_SHIPPING_POLICY: Record<string, ShippingPolicy> = {
  알라딘: {
    freeShippingThreshold: 15000,
    bundleAdditionalRate: 0.35,
    minAdditionalShipping: 700,
  },
  '알라딘 중고서점': {
    freeShippingThreshold: null,
    bundleAdditionalRate: 0.45,
    minAdditionalShipping: 900,
  },
  YES24: {
    freeShippingThreshold: 15000,
    bundleAdditionalRate: 0.4,
    minAdditionalShipping: 800,
  },
  교보문고: {
    freeShippingThreshold: 15000,
    bundleAdditionalRate: 0.4,
    minAdditionalShipping: 800,
  },
  Amazon: {
    freeShippingThreshold: null,
    bundleAdditionalRate: 1,
    minAdditionalShipping: 0,
  },
  'Amazon JP': {
    freeShippingThreshold: null,
    bundleAdditionalRate: 1,
    minAdditionalShipping: 0,
  },
  아마존: {
    freeShippingThreshold: null,
    bundleAdditionalRate: 1,
    minAdditionalShipping: 0,
  },
};

const buildSellerGroupKey = (offer: Offer) => `${offer.vendor}::${offer.sellerName}`.replace(/\s+/g, ' ').trim().toLowerCase();

const resolveShippingPolicy = (vendor: string): ShippingPolicy => {
  const policy = VENDOR_SHIPPING_POLICY[vendor];
  if (policy) return policy;

  if (BUNDLE_FRIENDLY_VENDORS.has(vendor)) {
    return {
      freeShippingThreshold: 15000,
      bundleAdditionalRate: 0.4,
      minAdditionalShipping: 800,
    };
  }

  return DEFAULT_SHIPPING_POLICY;
};

const applySingleShippingPolicy = (vendor: string, price: number, listedShippingCost: number): number => {
  const baseShipping = Math.max(0, safeNumber(listedShippingCost, 0));
  const policy = resolveShippingPolicy(vendor);

  if (policy.freeShippingThreshold !== null && price >= policy.freeShippingThreshold) {
    return 0;
  }

  return baseShipping;
};

const computeDataCompleteness = (offer: Offer): number => {
  const checkpoints = [
    Boolean(offer.isbn13),
    Boolean(offer.author),
    Boolean(offer.coverUrl),
    Boolean(offer.url),
    Number.isFinite(offer.shippingDays),
    Number.isFinite(offer.price),
    Number.isFinite(offer.shippingCost),
  ];
  const hits = checkpoints.filter(Boolean).length;
  return hits / checkpoints.length;
};

const computePriceStability = (offers: Offer[]): number => {
  if (offers.length <= 1) return 0.7;
  const totals = offers.map((offer) => offer.price + offer.shippingCost);
  const mean = totals.reduce((sum, value) => sum + value, 0) / totals.length;
  if (mean <= 0) return 0.5;

  const variance = totals.reduce((sum, value) => sum + (value - mean) ** 2, 0) / totals.length;
  const stdDev = Math.sqrt(variance);
  const coefficient = stdDev / mean;
  return clamp(1 - coefficient * 1.6, 0, 1);
};

const computeFreshness = (crawledAt: string): number => {
  const ts = Date.parse(crawledAt);
  if (!Number.isFinite(ts)) return 0.45;

  const ageHours = Math.max(0, (Date.now() - ts) / (1000 * 60 * 60));
  return clamp(1 - ageHours / 72, 0.25, 1);
};

const sanitizeIdentityOverride = (override?: BookIdentityOverride): BookIdentityOverride | undefined => {
  if (!override) return undefined;

  const title = override.title?.trim();
  const author = override.author?.trim();
  const isbn13 = normalizeIsbn13(override.isbn13);

  if (!title && !author && !isbn13) return undefined;
  return { title, author, isbn13 };
};

interface OriginalLinkContext {
  originalTitle: string | null;
  sourceAuthor: string | null;
  sourcePubYear: number | null;
  isbnCandidates: string[];
}

type OriginalLinkPriority = 'ISBN' | 'TITLE' | 'AUTHOR_YEAR' | 'NONE';

interface OriginalLinkResult {
  matched: boolean;
  priority: OriginalLinkPriority;
  score: number;
  reason: string;
}

const EMPTY_ORIGINAL_LINK_CONTEXT: OriginalLinkContext = {
  originalTitle: null,
  sourceAuthor: null,
  sourcePubYear: null,
  isbnCandidates: [],
};

const extractYear = (value: string | undefined): number | null => {
  if (!value) return null;
  const normalized = value.replace(/[^\d]/g, ' ');
  const match = normalized.match(/\b(19|20)\d{2}\b/);
  if (!match) return null;
  const year = Number(match[0]);
  return Number.isFinite(year) ? year : null;
};

const normalizePersonKey = (value: string | undefined): string =>
  (value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s'"`’‘,./\\|()[\]{}\-_:;!?~]/g, '');

const buildOriginalLinkContext = (
  options: {
    originalTitle: string | null;
    overrideIsbn?: string;
    seedAuthor?: string;
    seedPubDate?: string;
    aladinOffers: Offer[];
  },
): OriginalLinkContext => {
  const isbnCandidates = Array.from(
    new Set(
      [options.overrideIsbn, ...options.aladinOffers.filter((offer) => offer.isOriginalEdition).map((offer) => normalizeIsbn13(offer.isbn13))]
        .filter((isbn): isbn is string => Boolean(isbn)),
    ),
  );

  return {
    originalTitle: options.originalTitle,
    sourceAuthor: options.seedAuthor?.trim() || null,
    sourcePubYear: extractYear(options.seedPubDate),
    isbnCandidates,
  };
};

const evaluateOriginalLink = (
  raw: { isbn13?: string; author?: string; title?: string; notes?: string },
  matchedTitle: string,
  queryTitle: string,
  context: OriginalLinkContext,
): OriginalLinkResult => {
  const rawIsbn = normalizeIsbn13(raw.isbn13);
  if (rawIsbn && context.isbnCandidates.includes(rawIsbn)) {
    return {
      matched: true,
      priority: 'ISBN',
      score: 1,
      reason: 'ISBN 일치',
    };
  }

  const linkTitle = context.originalTitle || queryTitle;
  const titleScore = computeTitleMatchConfidence(linkTitle, matchedTitle);
  const exactTitle = isExactTitleMatch(linkTitle, matchedTitle);
  if (exactTitle || titleScore >= 0.68) {
    return {
      matched: true,
      priority: 'TITLE',
      score: clamp(exactTitle ? 1 : titleScore, 0.7, 1),
      reason: exactTitle ? '원제 정확 일치' : `원제 유사도 ${Math.round(titleScore * 100)}점`,
    };
  }

  const sourceAuthorKey = normalizePersonKey(context.sourceAuthor || undefined);
  const rawAuthorKey = normalizePersonKey(raw.author);
  const authorMatched =
    Boolean(sourceAuthorKey) &&
    Boolean(rawAuthorKey) &&
    (rawAuthorKey.includes(sourceAuthorKey) || sourceAuthorKey.includes(rawAuthorKey));

  if (!authorMatched) {
    return {
      matched: false,
      priority: 'NONE',
      score: clamp(titleScore, 0, 1),
      reason: '저자 조건 불일치',
    };
  }

  const rawPubYear = extractYear(`${raw.notes ?? ''} ${raw.title ?? ''}`);
  const yearMatched =
    context.sourcePubYear !== null &&
    rawPubYear !== null &&
    Math.abs(context.sourcePubYear - rawPubYear) <= 1;

  if (context.sourcePubYear !== null && rawPubYear !== null && !yearMatched) {
    return {
      matched: false,
      priority: 'NONE',
      score: clamp(titleScore, 0, 1),
      reason: `저자는 일치하지만 출간년도 불일치 (${context.sourcePubYear} vs ${rawPubYear})`,
    };
  }

  return {
    matched: true,
    priority: 'AUTHOR_YEAR',
    score: yearMatched ? 0.76 : 0.7,
    reason: yearMatched ? '저자+출간년도 연계 성공' : '저자 연계 성공(출간년도 정보 부족)',
  };
};

const extractOriginalTitle = (value: string | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withoutTrailingParen = trimmed.replace(/\s*\([^)]*\)\s*$/g, '').trim();
  return withoutTrailingParen || null;
};

const resolveOriginalTitleFromItem = async (item: Record<string, unknown> | undefined): Promise<string | null> => {
  if (!item) return null;

  const subInfoOriginal = (item.subInfo as { originalTitle?: string } | undefined)?.originalTitle;
  const directOriginal = extractOriginalTitle(subInfoOriginal);
  if (directOriginal) return directOriginal;

  const itemId = Number(item.itemId);
  if (Number.isFinite(itemId) && itemId > 0) {
    const lookup = await lookupAladinItemByItemId(itemId);
    const lookupOriginal = extractOriginalTitle((lookup?.subInfo as { originalTitle?: string } | undefined)?.originalTitle);
    if (lookupOriginal) return lookupOriginal;
  }

  const isbn13 = normalizeIsbn13(item.isbn13 as string | undefined);
  if (isbn13) {
    const lookup = await lookupAladinItemByIsbn13(isbn13);
    const lookupOriginal = extractOriginalTitle((lookup?.subInfo as { originalTitle?: string } | undefined)?.originalTitle);
    if (lookupOriginal) return lookupOriginal;
  }

  const fallback = await resolveOriginalTitleFallback({
    title: typeof item.title === 'string' ? item.title : undefined,
    author: typeof item.author === 'string' ? item.author : undefined,
    isbn13,
    pubDate: typeof item.pubDate === 'string' ? item.pubDate : undefined,
  });
  if (fallback?.originalTitle) {
    return fallback.originalTitle;
  }

  return null;
};

const createOfferFromAladinItem = (
  query: ParsedQuery,
  item: { [key: string]: unknown; title?: string; author?: string; isbn13?: string; link?: string; cover?: string; stockStatus?: string; priceSales?: number; priceStandard?: number; subInfo?: unknown },
  params: {
    matchConfidence: number;
    isOriginalEdition?: boolean;
    originalTitle?: string;
    includeNew: boolean;
  },
): Offer[] => {
  const offers: Offer[] = [];
  const listPrice = safeNumber(item.priceSales, safeNumber(item.priceStandard, 0));

  if (params.includeNew && listPrice > 0) {
    offers.push({
      itemId: safeNumber(item.itemId, 0) > 0 ? safeNumber(item.itemId, 0) : undefined,
      id: generateId('offer'),
      queryId: query.id,
      queryTitle: query.raw,
      normalizedQueryTitle: query.normalized,
      matchedTitle: item.title || query.raw,
      normalizedMatchedTitle: normalizeTitle(item.title || query.raw),
      author: item.author,
      isbn13: item.isbn13,
      vendor: '알라딘',
      sellerName: params.isOriginalEdition ? '알라딘 공식(원서)' : '알라딘 공식',
      source: 'ALADIN_API',
      condition: '최상',
      conditionConfidence: 0.97,
      isUsed: false,
      price: listPrice,
      shippingCost: applySingleShippingPolicy('알라딘', listPrice, 2500),
      shippingDays: 1,
      trustScore: 0.96,
      inStock: !item.stockStatus,
      notes: params.isOriginalEdition ? '알라딘 원서 가격' : '알라딘 신간/정가 정보',
      url: item.link,
      coverUrl: normalizeCoverUrl(item.cover as string | undefined),
      isOriginalEdition: params.isOriginalEdition,
      originalTitle: params.originalTitle,
      matchConfidence: params.matchConfidence,
      crawledAt: new Date().toISOString(),
    });
  }

  const usedList = extractAladinUsedChannels(item as { subInfo?: unknown });
  const usedChannels = [
    {
      key: 'aladinUsed',
      vendor: '알라딘 중고서점',
      sellerName: params.isOriginalEdition ? '알라딘 직접배송 중고(원서)' : '알라딘 직접배송 중고',
      defaultCondition: '상' as ConditionLevel,
      trustScore: 0.9,
      shippingDays: 2,
    },
    {
      key: 'userUsed',
      vendor: '알라딘 중고서점',
      sellerName: params.isOriginalEdition ? '회원 직접배송 중고(원서)' : '회원 직접배송 중고',
      defaultCondition: '중' as ConditionLevel,
      trustScore: 0.74,
      shippingDays: 3,
    },
    {
      key: 'spaceUsed',
      vendor: '알라딘 중고서점',
      sellerName: params.isOriginalEdition ? '광활한 우주점 중고(원서)' : '광활한 우주점 중고',
      defaultCondition: '상' as ConditionLevel,
      trustScore: 0.86,
      shippingDays: 2,
    },
  ] as const;

  for (const channel of usedChannels) {
    const channelInfo = (usedList as Record<string, { minPrice?: number; itemCount?: number; link?: string } | undefined>)[
      channel.key
    ];
    if (!channelInfo) continue;

    const minPrice = safeNumber(channelInfo.minPrice, 0);
    const itemCount = safeNumber(channelInfo.itemCount, 0);
    if (minPrice <= 0 || itemCount <= 0) continue;

    offers.push({
      itemId: safeNumber(item.itemId, 0) > 0 ? safeNumber(item.itemId, 0) : undefined,
      id: generateId('offer'),
      queryId: query.id,
      queryTitle: query.raw,
      normalizedQueryTitle: query.normalized,
      matchedTitle: item.title || query.raw,
      normalizedMatchedTitle: normalizeTitle(item.title || query.raw),
      author: item.author,
      isbn13: item.isbn13,
      vendor: channel.vendor,
      sellerName: channel.sellerName,
      source: 'ALADIN_API',
      condition: channel.defaultCondition,
      conditionConfidence: 0.78,
      isUsed: true,
      price: minPrice,
      shippingCost: applySingleShippingPolicy(channel.vendor, minPrice, 2500),
      shippingDays: channel.shippingDays,
      trustScore: channel.trustScore,
      inStock: true,
      notes: params.isOriginalEdition
        ? `알라딘 원서 중고 최저가 (재고 ${itemCount}개)`
        : `알라딘 중고 최저가 (재고 ${itemCount}개)`,
      url: channelInfo.link || (item.link as string | undefined),
      coverUrl: normalizeCoverUrl(item.cover as string | undefined),
      isOriginalEdition: params.isOriginalEdition,
      originalTitle: params.originalTitle,
      matchConfidence: params.matchConfidence,
      crawledAt: new Date().toISOString(),
    });
  }

  return offers;
};

const mapAladinOffers = async (
  query: ParsedQuery,
  override: BookIdentityOverride | undefined,
  preferences: UserPreferences,
  options: { includeOriginalFromAladin?: boolean } = {},
): Promise<{ offers: Offer[]; originalTitle: string | null; originalLinkContext: OriginalLinkContext }> => {
  const includeOriginalFromAladin = options.includeOriginalFromAladin ?? true;
  const sanitizedOverride = sanitizeIdentityOverride(override);
  const overrideIsbn = normalizeIsbn13(sanitizedOverride?.isbn13);
  const authorTarget = sanitizedOverride?.author?.toLowerCase();
  const queryLower = query.raw.toLowerCase();
  const titleTarget = sanitizedOverride?.title || query.raw;

  const searchRequests: Array<Promise<ReturnType<typeof searchAladinItems>>> = [];
  const searchTerms = Array.from(
    new Set([sanitizedOverride?.title, query.raw].map((term) => term?.trim()).filter(Boolean) as string[]),
  );

  for (const term of searchTerms) {
    searchRequests.push(searchAladinItems(term, 30, { queryType: 'Title', searchTarget: 'Book' }));
    searchRequests.push(searchAladinItems(term, 20, { queryType: 'Keyword', searchTarget: 'Book' }));
  }
  if (authorTarget) {
    searchRequests.push(searchAladinItems(authorTarget, 20, { queryType: 'Author', searchTarget: 'Book' }));
  }

  const termResults = await Promise.all(searchRequests);
  const mergedItems = termResults.flat();

  if (overrideIsbn) {
    const lookupItem = await lookupAladinItemByIsbn13(overrideIsbn);
    if (lookupItem) {
      mergedItems.unshift(lookupItem);
    }
  }

  const seenKey = new Set<string>();
  const items = mergedItems.filter((item) => {
    const key = normalizeIsbn13(item.isbn13) ?? `${normalizeTitle(item.title || '')}|${safeNumber(item.priceSales, 0)}`;
    if (seenKey.has(key)) return false;
    seenKey.add(key);
    return true;
  });

  const scoredItems = items
    .map((item) => {
      const base = computeTitleMatchConfidence(titleTarget, item.title || query.raw);
      const exactTitleMatch = isExactTitleMatch(titleTarget, item.title || query.raw);
      let adjusted = exactTitleMatch ? 1 : base;
      const queryAuthorMatch = (item.author || '').toLowerCase().includes(queryLower);

      if (authorTarget) {
        const author = (item.author || '').toLowerCase();
        adjusted += author.includes(authorTarget) ? 0.18 : -0.18;
      }
      if (!authorTarget && queryAuthorMatch) {
        adjusted += 0.1;
      }

      if (overrideIsbn) {
        const itemIsbn = normalizeIsbn13(item.isbn13);
        if (itemIsbn && itemIsbn === overrideIsbn) adjusted = 1;
        else adjusted -= 0.35;
      }

      return {
        item,
        exactTitleMatch,
        queryAuthorMatch,
        matchConfidence: clamp(adjusted, 0, 1),
      };
    })
    .sort((a, b) => b.matchConfidence - a.matchConfidence);

  const exactIsbnRows = overrideIsbn
    ? scoredItems.filter((row) => normalizeIsbn13(row.item.isbn13) === overrideIsbn)
    : [];
  const exactTitleRows = overrideIsbn
    ? []
    : scoredItems.filter((row) => row.exactTitleMatch);
  const authorModeRows = overrideIsbn
    ? []
    : scoredItems.filter((row) => row.queryAuthorMatch);

  // 정확 일치가 없으면 상위 후보라도 최소한 남겨서 "결과 0"을 줄임
  const fallbackRows = scoredItems.filter((row) => row.matchConfidence >= Math.max(0.62, TITLE_MATCH_THRESHOLD));
  const useAuthorMode = !overrideIsbn && !sanitizedOverride?.title && exactTitleRows.length === 0 && authorModeRows.length > 0;
  const candidates = overrideIsbn
    ? exactIsbnRows
    : (exactTitleRows.length > 0
      ? exactTitleRows
      : useAuthorMode
        ? authorModeRows.slice(0, 5)
        : fallbackRows.slice(0, 3));

  if (candidates.length === 0) {
    return { offers: [], originalTitle: null, originalLinkContext: EMPTY_ORIGINAL_LINK_CONTEXT };
  }

  const offers: Offer[] = [];
  const bestMatchConfidence = candidates[0]?.matchConfidence ?? 0;
  const dynamicCutoff = useAuthorMode ? 0 : Math.max(TITLE_MATCH_THRESHOLD, bestMatchConfidence - 0.24);

  for (const row of candidates) {
    const { item, matchConfidence } = row;
    if (matchConfidence < dynamicCutoff) continue;
    if (authorTarget && !(item.author || '').toLowerCase().includes(authorTarget) && !overrideIsbn) {
      continue;
    }

    offers.push(
      ...createOfferFromAladinItem(query, item as Record<string, unknown>, {
        matchConfidence: useAuthorMode ? Math.max(matchConfidence, 0.78) : matchConfidence,
        includeNew: preferences.includeNew,
      }),
    );
  }

  if (offers.length === 0 && candidates[0]) {
    // 마지막 안전장치: 최고 후보 1개는 무조건 반영
    offers.push(
      ...createOfferFromAladinItem(query, candidates[0].item as Record<string, unknown>, {
        matchConfidence: candidates[0].matchConfidence,
        includeNew: preferences.includeNew,
      }),
    );
  }

  let originalTitle: string | null = null;
  const seedItem = candidates[0]?.item as { author?: string; pubDate?: string } | undefined;

  if (preferences.includeOriginalEditions) {
    originalTitle = await resolveOriginalTitleFromItem(candidates[0]?.item as Record<string, unknown> | undefined);

    if (originalTitle && includeOriginalFromAladin) {
      const foreignResults = await Promise.all([
        searchAladinItems(originalTitle, 20, { queryType: 'Title', searchTarget: 'Foreign' }),
        searchAladinItems(originalTitle, 20, { queryType: 'Keyword', searchTarget: 'Foreign' }),
      ]);

      const foreignItems = foreignResults.flat();
      const seen = new Set<string>();
      const dedupedForeign = foreignItems.filter((item) => {
        const key = normalizeIsbn13(item.isbn13) ?? normalizeTitle(item.title || '');
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      for (const item of dedupedForeign) {
        const exact = isExactTitleMatch(originalTitle, item.title || originalTitle);
        const score = computeTitleMatchConfidence(originalTitle, item.title || originalTitle);
        if (!exact && score < 0.68) continue;

        offers.push(
          ...createOfferFromAladinItem(query, item as Record<string, unknown>, {
            matchConfidence: clamp(score, 0.7, 1),
            isOriginalEdition: true,
            originalTitle,
            includeNew: preferences.includeOriginalNew,
          }),
        );
      }
    }
  }

  const finalOffers = preferences.originalOnly ? offers.filter((offer) => offer.isOriginalEdition) : offers;
  const originalLinkContext = buildOriginalLinkContext({
    originalTitle,
    overrideIsbn,
    seedAuthor: seedItem?.author,
    seedPubDate: seedItem?.pubDate,
    aladinOffers: offers,
  });

  return { offers: finalOffers, originalTitle, originalLinkContext };
};

const mapCrawlerOffers = async (query: ParsedQuery, override?: BookIdentityOverride): Promise<Offer[]> => {
  const sanitizedOverride = sanitizeIdentityOverride(override);
  const titleTarget = sanitizedOverride?.title || query.raw;
  const authorTarget = sanitizedOverride?.author?.toLowerCase();
  const overrideIsbn = normalizeIsbn13(sanitizedOverride?.isbn13);
  const crawled = await fetchCrawledOffers(query.raw);

  return crawled
    .map((raw) => {
      const inferred = inferCondition(raw.conditionText, raw.notes, '중');
      const matchedTitle = raw.title?.trim() || query.raw;
      let matchConfidence = computeTitleMatchConfidence(titleTarget, matchedTitle);
      const exactTitleMatch = isExactTitleMatch(titleTarget, matchedTitle);

      if (authorTarget) {
        const author = (raw.author || '').toLowerCase();
        matchConfidence += author.includes(authorTarget) ? 0.08 : -0.08;
      }

      if (overrideIsbn) {
        const rawIsbn = normalizeIsbn13(raw.isbn13);
        if (rawIsbn && rawIsbn === overrideIsbn) {
          matchConfidence = 1;
        } else if (rawIsbn) {
          matchConfidence -= 0.35;
        } else {
          matchConfidence -= 0.15;
        }
      }
      matchConfidence = clamp(matchConfidence, 0, 1);

      return {
        id: generateId('offer'),
        queryId: query.id,
        queryTitle: query.raw,
        normalizedQueryTitle: query.normalized,
        matchedTitle,
        normalizedMatchedTitle: normalizeTitle(matchedTitle),
        author: raw.author,
        isbn13: raw.isbn13,
        vendor: raw.vendor || '개인판매자',
        sellerName: raw.sellerName || raw.vendor || '크롤링 셀러',
        source: 'WEB_CRAWLER' as const,
        condition: inferred.condition,
        conditionConfidence: inferred.confidence,
        isUsed: raw.isUsed ?? true,
        price: Math.max(500, safeNumber(raw.price, 0)),
        shippingCost: applySingleShippingPolicy(
          raw.vendor || '개인판매자',
          Math.max(500, safeNumber(raw.price, 0)),
          Math.max(0, safeNumber(raw.shippingCost, 2500)),
        ),
        shippingDays: Math.max(1, safeNumber(raw.shippingDays, 3)),
        trustScore: clamp(
          safeNumber(raw.trustScore, VENDOR_TRUST_BASELINE[raw.vendor || ''] ?? 0.68),
          0.2,
          0.99,
        ),
        inStock: raw.inStock ?? true,
        notes: raw.notes,
        url: raw.url,
        coverUrl: raw.coverUrl,
        matchConfidence,
        exactTitleMatch,
        crawledAt: new Date().toISOString(),
      } as Offer & { exactTitleMatch: boolean };
    })
    .filter((offer) => {
      if (offer.price <= 0) return false;
      if (offer.matchConfidence < TITLE_MATCH_THRESHOLD) return false;
      if (!(offer as Offer & { exactTitleMatch?: boolean }).exactTitleMatch) return false;

      if (overrideIsbn) {
        const offerIsbn = normalizeIsbn13(offer.isbn13);
        if (offerIsbn && offerIsbn !== overrideIsbn) return false;
        if (!offerIsbn) return false;
      }

      return true;
    });
};

const mapAmazonOriginalOffers = async (
  query: ParsedQuery,
  originalLinkContext: OriginalLinkContext,
  preferences: UserPreferences,
): Promise<Offer[]> => {
  const originalTitle = originalLinkContext.originalTitle;
  const originalSeedTitle = originalTitle || query.raw;
  if (!originalSeedTitle) return [];
  const rows = await fetchAmazonOffers(originalSeedTitle);

  return rows
    .map((raw) => {
      const matchedTitle = raw.title?.trim() || originalSeedTitle;
      const inferred = inferCondition(raw.conditionText, raw.notes, '중');
      const isUsed = raw.isUsed ?? true;
      const amazonUsedCondition = normalizeAmazonUsedCondition(raw.conditionText, inferred.condition);
      const linkResult = evaluateOriginalLink(raw, matchedTitle, query.raw, originalLinkContext);
      const market = raw.market ?? 'GLOBAL';
      const currency = raw.currency ?? (market === 'JP' ? 'JPY' : 'KRW');
      const fxRate = currency === 'JPY' ? Math.max(1, DEFAULT_JPY_KRW_RATE) : 1;
      const normalizedPrice = Math.max(1000, safeNumber(raw.price, 0));
      const normalizedShipping = Math.max(0, safeNumber(raw.shippingCost, 0));
      const priceKrw = currency === 'JPY' ? Math.round(normalizedPrice * fxRate) : normalizedPrice;
      const shippingKrw = currency === 'JPY' ? Math.round(normalizedShipping * fxRate) : normalizedShipping;
      const marketVendor = market === 'JP' ? 'Amazon JP' : raw.vendor || 'Amazon';
      const marketSellerName = raw.sellerName || (market === 'JP' ? 'Amazon JP Seller' : 'Amazon Seller');
      const fxNote =
        currency === 'JPY'
          ? ` (JPY ${normalizedPrice.toLocaleString('ja-JP')} + 배송 ${normalizedShipping.toLocaleString('ja-JP')} 환산, 1엔=${fxRate.toFixed(2)}원)`
          : '';
      const linkNote = `[연계 ${linkResult.priority}] ${linkResult.reason}`;

      return {
        id: generateId('offer'),
        queryId: query.id,
        queryTitle: query.raw,
        normalizedQueryTitle: query.normalized,
        matchedTitle,
        normalizedMatchedTitle: normalizeTitle(matchedTitle),
        author: raw.author,
        isbn13: raw.isbn13,
        vendor: marketVendor,
        sellerName: marketSellerName,
        source: 'AMAZON_CRAWLER' as const,
        condition: inferred.condition,
        conditionConfidence: inferred.confidence,
        isUsed,
        price: priceKrw,
        shippingCost: applySingleShippingPolicy(
          marketVendor,
          priceKrw,
          shippingKrw,
        ),
        shippingDays: Math.max(2, safeNumber(raw.shippingDays, 7)),
        trustScore: clamp(
          safeNumber(raw.notes?.includes('fulfilled') ? 0.88 : 0.78, 0.78),
          0.2,
          0.99,
        ),
        inStock: raw.inStock ?? true,
        notes: `${raw.notes ?? (market === 'JP' ? '아마존 재팬 원서' : '아마존 원서')}${fxNote} · ${linkNote}`,
        url: raw.url,
        coverUrl: normalizeCoverUrl(raw.coverUrl),
        isOriginalEdition: true,
        originalTitle: originalTitle || originalSeedTitle,
        amazonUsedCondition,
        market,
        currency,
        originalPrice: normalizedPrice,
        originalShippingCost: normalizedShipping,
        fxRate: currency === 'JPY' ? fxRate : undefined,
        matchConfidence: linkResult.score,
        crawledAt: new Date().toISOString(),
      } satisfies Offer;
    })
    .filter((offer) => {
      if (!offer.inStock) return false;
      if (!preferences.includeOriginalNew && !offer.isUsed) return false;
      if (!offer.notes?.includes('[연계 ISBN]') && !offer.notes?.includes('[연계 TITLE]') && !offer.notes?.includes('[연계 AUTHOR_YEAR]')) {
        return false;
      }
      if (offer.market === 'JP') {
        if (offer.matchConfidence < 0.68) return false;
      } else if (offer.matchConfidence < 0.6) {
        return false;
      }
      if (!offer.isOriginalEdition) return false;
      return true;
    });
};

const dedupeOffers = (offers: Offer[]): Offer[] => {
  const map = new Map<string, Offer>();

  for (const offer of offers) {
    const key = [
      offer.queryId,
      normalizeTitle(offer.matchedTitle),
      offer.vendor,
      offer.sellerName,
      offer.condition,
      offer.price,
    ].join('|');

    if (!map.has(key)) {
      map.set(key, offer);
      continue;
    }

    const existing = map.get(key)!;
    if (offer.matchConfidence + offer.trustScore > existing.matchConfidence + existing.trustScore) {
      map.set(key, offer);
    }
  }

  return [...map.values()];
};

const filterOriginalOfferSources = (offers: Offer[], preferences: UserPreferences): Offer[] => {
  if (!preferences.includeOriginalEditions) return offers;
  const sourceMode = preferences.originalSourceMode;
  if (sourceMode === 'BOTH') return offers;

  return offers.filter((offer) => {
    if (!offer.isOriginalEdition) return true;
    if (sourceMode === 'ALADIN_ONLY') return offer.source === 'ALADIN_API';
    return offer.source === 'AMAZON_CRAWLER';
  });
};

const filterOutlierOffers = (offers: Offer[], override?: BookIdentityOverride): Offer[] => {
  if (offers.length <= 2) return offers;
  const overrideIsbn = normalizeIsbn13(override?.isbn13);

  if (overrideIsbn) {
    const exactOffers = offers.filter((offer) => normalizeIsbn13(offer.isbn13) === overrideIsbn);
    if (exactOffers.length > 0) return exactOffers;
  }

  const aladinNewOffers = offers.filter((offer) => offer.source === 'ALADIN_API' && !offer.isUsed);
  const referencePrice =
    aladinNewOffers.length > 0
      ? Math.min(...aladinNewOffers.map((offer) => offer.price + offer.shippingCost))
      : null;

  if (referencePrice === null) return offers;

  const minAcceptable = Math.max(1000, Math.round(referencePrice * 0.15));
  const maxAcceptable = Math.round(referencePrice * 2.8);

  return offers.filter((offer) => {
    const total = offer.price + offer.shippingCost;
    return total >= minAcceptable && total <= maxAcceptable;
  });
};

const selectIdentitySource = (query: ParsedQuery, offers: Offer[], override?: BookIdentityOverride) => {
  const overrideIsbn = normalizeIsbn13(override?.isbn13);
  const overrideAuthor = override?.author?.toLowerCase();

  if (overrideIsbn) {
    const exact = offers.find((offer) => normalizeIsbn13(offer.isbn13) === overrideIsbn);
    if (exact) return exact;
  }

  const sorted = offers
    .filter((offer) => offer.matchConfidence >= TITLE_MATCH_THRESHOLD)
    .slice()
    .sort((a, b) => {
      const coverBonusA = a.coverUrl ? 0.1 : 0;
      const coverBonusB = b.coverUrl ? 0.1 : 0;
      const sourceBonusA = a.source === 'ALADIN_API' ? 0.05 : 0;
      const sourceBonusB = b.source === 'ALADIN_API' ? 0.05 : 0;
      const authorBonusA =
        overrideAuthor && (a.author || '').toLowerCase().includes(overrideAuthor) ? 0.08 : 0;
      const authorBonusB =
        overrideAuthor && (b.author || '').toLowerCase().includes(overrideAuthor) ? 0.08 : 0;
      return (
        b.matchConfidence + coverBonusB + sourceBonusB + authorBonusB -
        (a.matchConfidence + coverBonusA + sourceBonusA + authorBonusA)
      );
    });

  return (
    sorted.find((offer) => offer.source === 'ALADIN_API' && Boolean(offer.coverUrl)) ??
    sorted.find((offer) => Boolean(offer.coverUrl)) ??
    sorted[0] ??
    null
  );
};

const normalizeMetric = (value: number, min: number, max: number, reverse = false): number => {
  if (max <= min) return 1;
  const normalized = (value - min) / (max - min);
  return clamp(reverse ? 1 - normalized : normalized, 0, 1);
};

const buildPriceForecast = (offers: Offer[], queryTitle: string) => {
  const sortedCosts = offers
    .map((offer) => offer.price + offer.shippingCost)
    .sort((a, b) => a - b);

  const median =
    sortedCosts.length === 0
      ? 15000
      : sortedCosts[Math.floor(sortedCosts.length / 2)] ?? sortedCosts[sortedCosts.length - 1];

  const usedOffers = offers.filter((offer) => offer.isUsed);
  const scarcity = usedOffers.length <= 1 ? 'HIGH' : usedOffers.length <= 3 ? 'MEDIUM' : 'LOW';

  const slope = scarcity === 'HIGH' ? 0.06 : scarcity === 'MEDIUM' ? 0.02 : -0.01;
  const rand = seededRandom(hashString(queryTitle));

  const now = new Date();
  const history: PricePoint[] = [];

  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = `${d.getMonth() + 1}월`;
    const noise = (rand() - 0.5) * 0.08;
    const trendFactor = 1 - slope * (i / 5) + noise;

    history.push({
      label,
      averagePrice: Math.max(2000, Math.round(median * trendFactor)),
    });
  }

  const last = history[history.length - 1]?.averagePrice ?? median;
  const projectedNext = Math.max(2000, Math.round(last * (1 + slope * 0.6 + (rand() - 0.5) * 0.04)));
  const expectedChangePct = ((projectedNext - last) / Math.max(1, last)) * 100;

  const signal = expectedChangePct > 3 ? 'BUY_NOW' : expectedChangePct < -3 ? 'WAIT' : 'HOLD';

  const reason =
    signal === 'BUY_NOW'
      ? '희소도와 최근 공급량을 보면 단기 가격 상승 가능성이 높습니다.'
      : signal === 'WAIT'
        ? '공급 여유가 있어 단기 하락 가능성이 있습니다.'
        : '가격 변동성이 낮아 지금/대기 모두 큰 차이가 없습니다.';

  return {
    history,
    expectedChangePct,
    signal,
    scarcity,
    reason,
  } as const;
};

const scoreOffers = (offers: Offer[], preferences: UserPreferences) => {
  const weights = normalizeWeights(preferences);

  const totals = offers.map((offer) => offer.price + offer.shippingCost);
  const shippingDays = offers.map((offer) => offer.shippingDays);
  const minTotal = Math.min(...totals);
  const maxTotal = Math.max(...totals);
  const minShipping = Math.min(...shippingDays);
  const maxShipping = Math.max(...shippingDays);

  const acceptableOffers = offers.filter((offer) => isConditionAtLeast(offer.condition, preferences.minCondition));
  const bestAcceptableCost = acceptableOffers.length
    ? Math.min(...acceptableOffers.map((offer) => offer.price + offer.shippingCost))
    : null;

  const scoreBreakdown: ScoreBreakdown[] = offers.map((offer) => {
    const totalCost = offer.price + offer.shippingCost;
    const normalizedPrice = normalizeMetric(totalCost, minTotal, maxTotal, true);
    const normalizedCondition = CONDITION_SCORE[offer.condition];
    const normalizedShipping = normalizeMetric(offer.shippingDays, minShipping, maxShipping, true);
    const normalizedTrust = clamp(offer.trustScore, 0, 1);

    const weightedPrice = normalizedPrice * weights.price;
    const weightedCondition = normalizedCondition * weights.condition;
    const weightedShipping = normalizedShipping * weights.shipping;
    const weightedTrust = normalizedTrust * weights.trust;

    const penalties: string[] = [];
    let penalty = 0;

    if (!isConditionAtLeast(offer.condition, preferences.minCondition)) {
      const savings = bestAcceptableCost === null ? 0 : bestAcceptableCost - totalCost;
      if (savings >= preferences.downgradeSavingsThreshold) {
        penalty += 0.06;
        penalties.push(`상태는 조금 낮지만 ${formatCurrency(savings)} 더 저렴함`);
      } else {
        penalty += 0.2;
        penalties.push('원하는 상태보다 낮음');
      }
    }

    if (offer.source === 'WEB_CRAWLER' && offer.conditionConfidence < 0.65) {
      penalty += 0.03;
      penalties.push('상태 설명이 불분명함');
    }

    if (offer.trustScore < 0.65) {
      penalty += 0.05;
      penalties.push('판매자 평판 낮음');
    }

    const totalScore = clamp(weightedPrice + weightedCondition + weightedShipping + weightedTrust - penalty, 0, 1);

    return {
      offerId: offer.id,
      totalScore,
      normalizedMetrics: {
        price: normalizedPrice,
        condition: normalizedCondition,
        shipping: normalizedShipping,
        trust: normalizedTrust,
      },
      weightedContributions: {
        price: weightedPrice,
        condition: weightedCondition,
        shipping: weightedShipping,
        trust: weightedTrust,
        penalty,
      },
      penalties,
    };
  });

  return scoreBreakdown.sort((a, b) => b.totalScore - a.totalScore);
};

const pickConsideredOffers = (offers: Offer[], preferences: UserPreferences): Offer[] =>
  offers.filter((offer) => {
    if (!offer.inStock) return false;
    if (preferences.originalOnly && !offer.isOriginalEdition) return false;
    if (!preferences.includeUsed && offer.isUsed) return false;

    if (offer.isOriginalEdition && offer.isUsed) {
      if (offer.source === 'ALADIN_API') {
        if (!isConditionAtLeast(offer.condition, preferences.minOriginalUsedConditionAladin)) return false;
      } else if (offer.source === 'AMAZON_CRAWLER') {
        const offerCondition = offer.amazonUsedCondition ?? normalizeAmazonUsedCondition(undefined, offer.condition);
        const minCondition = preferences.minOriginalUsedConditionAmazon;
        if (AMAZON_USED_CONDITION_PRIORITY[offerCondition] < AMAZON_USED_CONDITION_PRIORITY[minCondition]) return false;
      }
    }

    if (offer.isOriginalEdition) {
      if (!preferences.includeOriginalNew && !offer.isUsed) return false;
    } else if (!preferences.includeNew && !offer.isUsed) {
      return false;
    }

    const total = offer.price + offer.shippingCost;
    if (preferences.maxTotalPrice !== null && total > preferences.maxTotalPrice) return false;
    if (preferences.maxShippingDays !== null && offer.shippingDays > preferences.maxShippingDays) return false;

    if (preferences.strictCondition && !isConditionAtLeast(offer.condition, preferences.minCondition)) {
      return false;
    }

    return true;
  });

const buildDecision = (
  query: ParsedQuery,
  offers: Offer[],
  preferences: UserPreferences,
  override?: BookIdentityOverride,
): BookDecision => {
  const sanitizedOverride = sanitizeIdentityOverride(override);
  const sortedOffers = [...offers].sort((a, b) => a.price + a.shippingCost - (b.price + b.shippingCost));
  const consideredOffers = pickConsideredOffers(sortedOffers, preferences);
  const forecast = buildPriceForecast(offers, query.raw);

  const titleSource = selectIdentitySource(query, offers, sanitizedOverride);

  const matchedTitle = sanitizedOverride?.title || titleSource?.matchedTitle || query.raw;
  const author = sanitizedOverride?.author || titleSource?.author;
  const isbn13 = sanitizedOverride?.isbn13 || titleSource?.isbn13;
  const coverUrl = titleSource?.coverUrl;

  if (consideredOffers.length === 0) {
    const fallbackOffers = sortedOffers.filter((offer) => !offer.isUsed);
    const fallback = fallbackOffers[0];
    const allowFallbackNew = fallback
      ? (fallback.isOriginalEdition ? preferences.includeOriginalNew : preferences.includeNew)
      : false;

    if (fallback && allowFallbackNew) {
      const scoreBreakdown = scoreOffers([fallback], preferences);
      return {
        queryId: query.id,
        queryTitle: query.raw,
        queryNormalized: query.normalized,
        matchedTitle,
        author,
        isbn13,
        coverUrl,
        appliedOverride: sanitizedOverride,
        action: 'BUY_NEW',
        confidence: 0.58,
        reasoning: ['조건에 맞는 중고책이 없어 새책을 추천합니다.'],
        tradeoffs: ['새책이라 상태는 가장 좋지만 가격은 더 높습니다.'],
        risks: ['조금 기다리면 더 싼 중고가 나올 수 있습니다.'],
        fallbackMessage: '중고가 거의 없어 새책도 함께 보시는 게 좋습니다.',
        offers: sortedOffers,
        consideredOffers: [fallback],
        recommendedOfferId: fallback.id,
        scoreBreakdown,
        priceForecast: forecast,
      };
    }

    return {
      queryId: query.id,
      queryTitle: query.raw,
      queryNormalized: query.normalized,
      matchedTitle,
      author,
      isbn13,
      coverUrl,
      appliedOverride: sanitizedOverride,
      action: 'WAIT',
      confidence: 0.42,
      reasoning: ['지금 기준으로는 살 만한 책이 보이지 않아 조금 기다리는 편이 좋습니다.'],
      tradeoffs: ['조건을 조금 풀면 고를 수 있는 책이 늘어납니다.'],
      risks: ['구하기 어려운 책은 시간이 지나면 더 비싸질 수 있습니다.'],
      fallbackMessage: '조건을 조금 낮추거나 나중에 다시 검색해 보세요.',
      offers: sortedOffers,
      consideredOffers: [],
      recommendedOfferId: undefined,
      scoreBreakdown: [],
      priceForecast: forecast,
    };
  }

  const scoreBreakdown = scoreOffers(consideredOffers, preferences);
  const recommendedBreakdown = scoreBreakdown[0];
  const secondBreakdown = scoreBreakdown[1];

  const recommendedOffer = consideredOffers.find((offer) => offer.id === recommendedBreakdown.offerId);
  const secondOffer = secondBreakdown
    ? consideredOffers.find((offer) => offer.id === secondBreakdown.offerId)
    : undefined;

  if (!recommendedOffer) {
    return {
      queryId: query.id,
      queryTitle: query.raw,
      queryNormalized: query.normalized,
      matchedTitle,
      author,
      isbn13,
      coverUrl,
      appliedOverride: sanitizedOverride,
      action: 'WAIT',
      confidence: 0.45,
      reasoning: ['추천 계산이 매끄럽지 않아 지금은 기다리기를 권합니다.'],
      tradeoffs: [],
      risks: ['불러온 정보가 충분하지 않아 다시 확인이 필요합니다.'],
      offers: sortedOffers,
      consideredOffers,
      recommendedOfferId: undefined,
      scoreBreakdown,
      priceForecast: forecast,
    };
  }

  const action = recommendedOffer.isUsed ? 'BUY_USED' : 'BUY_NEW';

  const scoreGap = secondBreakdown ? recommendedBreakdown.totalScore - secondBreakdown.totalScore : 0.25;
  const countFactor = clamp(consideredOffers.length / 8, 0, 1);
  const gapFactor = clamp(scoreGap * 4, 0, 1);
  const dataQuality = clamp(
    (recommendedOffer.matchConfidence + recommendedOffer.conditionConfidence + recommendedOffer.trustScore) / 3,
    0,
    1,
  );
  const completenessFactor = computeDataCompleteness(recommendedOffer);
  const freshnessFactor = computeFreshness(recommendedOffer.crawledAt);
  const stabilityFactor = computePriceStability(consideredOffers);
  const availabilityFactor = clamp(consideredOffers.length / Math.max(offers.length, 1), 0, 1);
  const confidence = clamp(
    countFactor * 0.18 +
      gapFactor * 0.24 +
      dataQuality * 0.2 +
      completenessFactor * 0.12 +
      freshnessFactor * 0.13 +
      stabilityFactor * 0.08 +
      availabilityFactor * 0.05,
    0,
    1,
  );

  const recommendedTotal = recommendedOffer.price + recommendedOffer.shippingCost;
  const secondTotal = secondOffer ? secondOffer.price + secondOffer.shippingCost : null;
  const delta = secondTotal !== null ? secondTotal - recommendedTotal : 0;

  const reasoning = [
    `${recommendedOffer.vendor} / ${recommendedOffer.sellerName} 조합이 종합점수 ${Math.round(recommendedBreakdown.totalScore * 100)}점으로 1위입니다.`,
    `총비용 ${formatCurrency(recommendedTotal)}, 상태 ${recommendedOffer.condition}, 배송 ${recommendedOffer.shippingDays}일 기준으로 최적입니다.`,
  ];

  if (delta > 0) {
    reasoning.push(`차선책 대비 ${formatCurrency(delta)} 절약 가능합니다.`);
  }

  if (recommendedBreakdown.penalties.length > 0) {
    reasoning.push(`감점 반영 항목: ${recommendedBreakdown.penalties.join(' · ')}`);
  }

  if (freshnessFactor < 0.45) {
    reasoning.push('수집 시점이 오래된 항목이 있어 실제 결제 직전 가격/재고 재확인이 필요합니다.');
  }

  const tradeoffs = [
    secondOffer
      ? delta >= 0
        ? `두 번째 선택(${secondOffer.vendor})도 괜찮지만 총비용이 ${formatCurrency(Math.abs(delta))} 더 듭니다.`
        : `두 번째 선택(${secondOffer.vendor})이 가격은 ${formatCurrency(Math.abs(delta))} 더 싸지만 종합점수가 낮습니다.`
      : '비교 가능한 다른 선택지가 많지 않습니다.',
    preferences.strictCondition
      ? `설정한 최소 품질(${CONDITION_DISPLAY_LABEL[preferences.minCondition]})보다 낮은 책은 제외했습니다.`
      : `최소 품질보다 낮아도 절약 금액이 크면 일부 포함했습니다.`,
  ];

  const risks: string[] = [];
  if (recommendedOffer.source === 'WEB_CRAWLER' && recommendedOffer.conditionConfidence < 0.75) {
    risks.push('상태 정보가 판매자 설명 기반이라 실제와 다를 수 있습니다.');
  }
  if (forecast.scarcity === 'HIGH') {
    risks.push('이 책은 중고 물량이 적은 편입니다.');
  }
  if (recommendedOffer.trustScore < 0.7) {
    risks.push('판매자 평판이 낮아 상세 페이지 확인이 필요합니다.');
  }
  if (completenessFactor < 0.6) {
    risks.push('ISBN/표지/링크 같은 메타데이터가 일부 비어 있어 매칭 오차 가능성이 있습니다.');
  }
  if (freshnessFactor < 0.45) {
    risks.push('수집 시점이 오래되어 재고 품절 또는 가격 변경 가능성이 있습니다.');
  }
  if (risks.length === 0) {
    risks.push('눈에 띄는 큰 주의점은 없습니다.');
  }

  return {
    queryId: query.id,
    queryTitle: query.raw,
    queryNormalized: query.normalized,
    matchedTitle,
    author,
    isbn13,
    coverUrl,
    appliedOverride: sanitizedOverride,
    action,
    confidence,
    reasoning,
    tradeoffs,
    risks,
    offers: sortedOffers,
    consideredOffers,
    recommendedOfferId: recommendedOffer.id,
    nextBestOfferId: secondOffer?.id,
    nextBestDelta: secondTotal !== null ? secondTotal - recommendedTotal : undefined,
    scoreBreakdown,
    priceForecast: forecast,
  };
};

export const allocateBundledShipping = (offers: Offer[]): Map<string, number> => {
  const grouped = new Map<string, Offer[]>();

  for (const offer of offers) {
    const key = buildSellerGroupKey(offer);
    const group = grouped.get(key) ?? [];
    group.push(offer);
    grouped.set(key, group);
  }

  const allocation = new Map<string, number>();

  for (const group of grouped.values()) {
    if (group.length === 0) continue;
    const primary = group[0];
    const policy = resolveShippingPolicy(primary.vendor);
    const subtotal = group.reduce((sum, offer) => sum + offer.price, 0);

    if (policy.freeShippingThreshold !== null && subtotal >= policy.freeShippingThreshold) {
      for (const offer of group) allocation.set(offer.id, 0);
      continue;
    }

    if (group.length === 1 || policy.bundleAdditionalRate >= 1) {
      for (const offer of group) {
        allocation.set(offer.id, offer.shippingCost);
      }
      continue;
    }

    const sorted = [...group].sort((a, b) => b.shippingCost - a.shippingCost);
    const anchor = sorted[0];
    allocation.set(anchor.id, anchor.shippingCost);

    for (const offer of sorted.slice(1)) {
      const reduced = Math.max(
        policy.minAdditionalShipping,
        Math.round(Math.max(0, offer.shippingCost) * policy.bundleAdditionalRate),
      );
      allocation.set(offer.id, reduced);
    }
  }

  return allocation;
};

const estimateBundledShipping = (offers: Offer[]) => {
  const allocation = allocateBundledShipping(offers);
  let shipping = 0;
  for (const value of allocation.values()) {
    shipping += value;
  }
  return shipping;
};

const optimizeBundle = (decisions: BookDecision[]): BundleOptimization | undefined => {
  if (decisions.length < 2) return undefined;

  const candidatesByDecision: Offer[][] = [];

  for (const decision of decisions) {
    const candidates = decision.scoreBreakdown
      .slice(0, 3)
      .map((score) => decision.consideredOffers.find((offer) => offer.id === score.offerId))
      .filter((offer): offer is Offer => Boolean(offer));

    if (!candidates.length) return undefined;
    candidatesByDecision.push(candidates);
  }

  const maxCombinations = 3000;
  const theoreticalCombinations = candidatesByDecision.reduce((product, candidates) => product * candidates.length, 1);
  let scanned = 0;
  const combinations: Array<{
    offers: Offer[];
    subtotal: number;
    shipping: number;
    total: number;
    vendorsUsed: string[];
  }> = [];

  const dfs = (idx: number, selected: Offer[]) => {
    if (scanned >= maxCombinations) return;

    if (idx === candidatesByDecision.length) {
      scanned += 1;
      const subtotal = selected.reduce((sum, offer) => sum + offer.price, 0);
      const shipping = estimateBundledShipping(selected);
      const total = subtotal + shipping;
      combinations.push({
        offers: [...selected],
        subtotal,
        shipping,
        total,
        vendorsUsed: [...new Set(selected.map((offer) => offer.vendor))],
      });
      return;
    }

    for (const offer of candidatesByDecision[idx]) {
      selected.push(offer);
      dfs(idx + 1, selected);
      selected.pop();
    }
  };

  dfs(0, []);

  if (!combinations.length) return undefined;

  const uniqueSortedCombinations = combinations
    .sort((a, b) => a.total - b.total)
    .filter((combo, idx, arr) => {
      const signature = combo.offers.map((offer) => offer.id).sort().join('|');
      return arr.findIndex((row) => row.offers.map((offer) => offer.id).sort().join('|') === signature) === idx;
    });

  const bestCombo = uniqueSortedCombinations[0];
  const subtotal = bestCombo.subtotal;
  const shipping = bestCombo.shipping;
  const total = bestCombo.total;

  const individualTotal = decisions.reduce((sum, decision) => {
    const recommended = decision.consideredOffers.find((offer) => offer.id === decision.recommendedOfferId);
    return sum + (recommended ? recommended.price + recommended.shippingCost : 0);
  }, 0);

  const savingsVsIndividual = Math.max(0, individualTotal - total);

  const toBundleItem = (offer: Offer, bundledShippingCost: number): BundleItemSelection => ({
    queryId: offer.queryId,
    queryTitle: offer.queryTitle,
    matchedTitle: offer.matchedTitle,
    isbn13: offer.isbn13,
    offerId: offer.id,
    vendor: offer.vendor,
    sellerName: offer.sellerName,
    sellerKey: `${offer.vendor}::${offer.sellerName}`.replace(/\s+/g, '_').toLowerCase(),
    source: offer.source,
    url: offer.url,
    price: offer.price,
    shippingCost: offer.shippingCost,
    bundledShippingCost,
    shippingNote:
      offer.shippingCost === 0
        ? '원래 배송비 없음'
        : bundledShippingCost === 0
          ? '배송비 묶음 제외'
          : bundledShippingCost < offer.shippingCost
            ? `묶음 배송비 적용 (${formatCurrency(bundledShippingCost)})`
            : '개별 배송비 적용',
    totalPrice: offer.price + bundledShippingCost,
  });

  const bestBundleShipping = allocateBundledShipping(bestCombo.offers);
  const items: BundleItemSelection[] = bestCombo.offers.map((offer) =>
    toBundleItem(offer, bestBundleShipping.get(offer.id) ?? offer.shippingCost),
  );
  const vendorsUsed = [...bestCombo.vendorsUsed];

  const candidates = uniqueSortedCombinations.slice(0, 5).map((combo, idx) => {
    const shippingByOffer = allocateBundledShipping(combo.offers);
    return {
      rank: idx + 1,
      items: combo.offers.map((offer) => toBundleItem(offer, shippingByOffer.get(offer.id) ?? offer.shippingCost)),
      subtotal: combo.subtotal,
      shipping: combo.shipping,
      total: combo.total,
      vendorsUsed: combo.vendorsUsed,
      savingsVsBest: Math.max(0, combo.total - total),
    };
  });
  const nextBestCandidate = candidates[1];
  const truncatedByCap = theoreticalCombinations > maxCombinations;

  const rationale = [
    `가능 조합 ${theoreticalCombinations}개 중 ${scanned}개를 비교해 가장 싼 조합을 골랐습니다.`,
    `판매처 ${vendorsUsed.length}곳으로 묶어 배송비를 줄였습니다.`,
    `비교용 다른 조합 ${Math.max(0, candidates.length - 1)}개도 함께 보여드립니다.`,
  ];

  if (truncatedByCap) {
    rationale.push(`조합 폭증을 막기 위해 최대 ${maxCombinations}개까지만 탐색했습니다.`);
  }

  if (savingsVsIndividual > 0) {
    rationale.push(`각 책을 따로 샀을 때보다 ${formatCurrency(savingsVsIndividual)} 아꼈습니다.`);
  }

  if (nextBestCandidate) {
    rationale.push(`최적안이 품절되면 2순위 조합(총 ${formatCurrency(nextBestCandidate.total)})으로 바로 전환할 수 있습니다.`);
  }

  return {
    items,
    subtotal,
    shipping,
    total,
    savingsVsIndividual,
    vendorsUsed,
    scannedCombinations: scanned,
    truncatedByCap,
    rationale,
    candidates,
    nextBestCandidate,
  };
};

export const analyzeBookDecisions = async (
  queryInput: string,
  preferences: UserPreferences,
  identityOverrides: Record<string, BookIdentityOverride> = {},
): Promise<{ result: DecisionResult; stats: SearchExecutionStats }> => {
  const parsedQueries = parseQueries(queryInput);

  if (parsedQueries.length === 0) {
    return {
      result: {
        requestedAt: new Date().toISOString(),
        queries: [],
        decisions: [],
        globalWarnings: ['검색어가 비어 있습니다.'],
      },
      stats: {
        requestCount: 0,
        sourceStats: { aladinApiOffers: 0, crawlerOffers: 0, amazonOffers: 0 },
      },
    };
  }

  const globalWarnings: string[] = [];
  const includeAladinOriginal = preferences.includeOriginalEditions && preferences.originalSourceMode !== 'AMAZON_ONLY';
  const includeAmazonOriginal = preferences.includeOriginalEditions && preferences.originalSourceMode !== 'ALADIN_ONLY';

  const offersByQuery = await Promise.all(
    parsedQueries.map(async (query) => {
      const override = sanitizeIdentityOverride(identityOverrides[query.normalized]);
      let aladinOffers: Offer[] = [];
      let crawlerOffers: Offer[] = [];
      let amazonOffers: Offer[] = [];
      let nearTitles: string[] = [];
      let fetchFailed = false;

      try {
        const [aladinResult, crawlerResult] = await Promise.all([
          mapAladinOffers(query, override, preferences, { includeOriginalFromAladin: includeAladinOriginal }),
          mapCrawlerOffers(query, override),
        ]);
        aladinOffers = aladinResult.offers;
        crawlerOffers = crawlerResult;

        if (includeAmazonOriginal) {
          amazonOffers = await mapAmazonOriginalOffers(query, aladinResult.originalLinkContext, preferences);
        }

        if (!override && aladinOffers.length === 0) {
          const nearItems = await searchAladinItems(query.raw, 8);
          nearTitles = Array.from(
            new Set(
              nearItems
                .map((item) => (item.title || '').trim())
                .filter(Boolean),
            ),
          ).slice(0, 3);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        fetchFailed = true;
        globalWarnings.push(`${query.raw}: 책 정보를 불러오지 못했습니다. (${message})`);
      }

      const merged = filterOriginalOfferSources(
        dedupeOffers([...aladinOffers, ...crawlerOffers, ...amazonOffers]),
        preferences,
      ).sort(
        (a, b) => b.matchConfidence - a.matchConfidence,
      );
      const filtered = filterOutlierOffers(merged, override);

      return {
        query,
        override,
        nearTitles,
        offers: filtered,
        fetchFailed,
        sourceStats: {
          aladinApiOffers: aladinOffers.length,
          crawlerOffers: filtered.filter((offer) => offer.source === 'WEB_CRAWLER').length,
          amazonOffers: filtered.filter((offer) => offer.source === 'AMAZON_CRAWLER').length,
        },
      };
    }),
  );

  const decisions = offersByQuery.map(({ query, offers, override, nearTitles, fetchFailed }) => {
    if (!offers.length) {
      if (fetchFailed) {
        // 이미 상세 오류를 경고로 표시했으므로 중복 안내를 막는다.
      } else if (override?.isbn13) {
        globalWarnings.push(
          `${query.raw}: 입력한 ISBN(${override.isbn13})과 맞는 책을 찾지 못했습니다. 번호를 다시 확인해 주세요.`,
        );
      } else {
        if (nearTitles.length > 0) {
          globalWarnings.push(
            `${query.raw}: 정확히 같은 제목이 없어 제외했습니다. 비슷한 제목: ${nearTitles.join(' / ')}`,
          );
        } else {
          globalWarnings.push(
            `${query.raw}: 알라딘에서 정확히 같은 제목을 찾지 못했습니다. 제목을 다시 확인하거나 책 정보 수정을 눌러 주세요.`,
          );
        }
      }
    }
    return buildDecision(query, offers, preferences, override);
  });

  const bundleOptimization = optimizeBundle(
    decisions.filter((decision) => decision.consideredOffers.length > 0),
  );

  const stats: SearchExecutionStats = {
    requestCount: parsedQueries.length,
    sourceStats: {
      aladinApiOffers: offersByQuery.reduce((sum, row) => sum + row.sourceStats.aladinApiOffers, 0),
      crawlerOffers: offersByQuery.reduce((sum, row) => sum + row.sourceStats.crawlerOffers, 0),
      amazonOffers: offersByQuery.reduce((sum, row) => sum + row.sourceStats.amazonOffers, 0),
    },
  };

  if (!import.meta.env.VITE_ALADIN_TTB_KEY) {
    globalWarnings.push('알라딘 연결 설정이 없어 알라딘 가격은 가져오지 못했습니다.');
  }

  if (!import.meta.env.VITE_CRAWLER_API_BASE) {
    globalWarnings.push('다른 판매처 수집 주소가 없어 알라딘 가격만 표시됩니다.');
  }

  if (
    includeAmazonOriginal &&
    !import.meta.env.VITE_AMAZON_CRAWLER_API_BASE &&
    !import.meta.env.VITE_AMAZON_JP_CRAWLER_API_BASE &&
    !import.meta.env.VITE_CRAWLER_API_BASE
  ) {
    globalWarnings.push('아마존 수집 주소가 없어 아마존/아마존JP 원서 가격은 표시되지 않습니다.');
  } else if (
    includeAmazonOriginal &&
    !import.meta.env.VITE_AMAZON_JP_CRAWLER_API_BASE &&
    !import.meta.env.VITE_CRAWLER_API_BASE
  ) {
    globalWarnings.push('Amazon JP 수집 주소가 없어 일본어 원서는 일부 누락될 수 있습니다.');
  }

  return {
    result: {
      requestedAt: new Date().toISOString(),
      queries: parsedQueries,
      decisions,
      bundleOptimization,
      globalWarnings,
    },
    stats,
  };
};

export const describeSource = (offer: Offer): string => {
  if (offer.source === 'AMAZON_CRAWLER' && offer.market === 'JP') {
    return '아마존 JP';
  }
  return SOURCE_LABELS[offer.source];
};
