import { ConditionLevel, UserPreferences } from './types';

export const CONDITION_SCORE: Record<ConditionLevel, number> = {
  최상: 1,
  상: 0.82,
  중: 0.62,
  하: 0.35,
};

export const CONDITION_PRIORITY: Record<ConditionLevel, number> = {
  최상: 4,
  상: 3,
  중: 2,
  하: 1,
};

export const CONDITION_DISPLAY_LABEL: Record<ConditionLevel, string> = {
  최상: '최상급',
  상: '상급',
  중: '중급',
  하: '중급',
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  priceWeight: 35,
  conditionWeight: 30,
  shippingWeight: 20,
  trustWeight: 15,
  minCondition: '중',
  strictCondition: false,
  includeUsed: true,
  includeNew: true,
  includeOriginalEditions: false,
  originalOnly: false,
  originalSourceMode: 'BOTH',
  includeOriginalNew: true,
  minOriginalUsedConditionAladin: '중',
  minOriginalUsedConditionAmazon: 'GOOD',
  maxTotalPrice: null,
  maxShippingDays: null,
  downgradeSavingsThreshold: 4000,
};

export const BUNDLE_FRIENDLY_VENDORS = new Set(['알라딘', 'YES24', '교보문고']);

export const SOURCE_LABELS = {
  ALADIN_API: '알라딘',
  WEB_CRAWLER: '다른 판매처',
  AMAZON_CRAWLER: '아마존',
} as const;

export const VENDOR_TRUST_BASELINE: Record<string, number> = {
  알라딘: 0.95,
  '알라딘 중고서점': 0.9,
  YES24: 0.88,
  교보문고: 0.87,
  아마존: 0.82,
  'Amazon JP': 0.82,
  개인판매자: 0.6,
};

export const CONDITION_KEYWORDS: Record<ConditionLevel, string[]> = {
  최상: ['미개봉', '새책같', '최상', '밑줄없', '보관상태 좋', '스크래치 없음'],
  상: ['상태 좋', '깨끗', '사용감 적', '양호', '생활기스'],
  중: ['사용감', '필기', '접힘', '변색 약간', '중고감'],
  하: ['낙서', '찢김', '물얼룩', '페이지 누락', '심한 변색', '파손'],
};

export const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount);

export const toPercent = (value: number): string => `${Math.round(value * 100)}%`;

export const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, value));

export const normalizeTitle = (title: string): string =>
  title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\[\](){}'"`~!@#$%^&*_=+|:;,.<>/?\\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const isConditionAtLeast = (condition: ConditionLevel, minCondition: ConditionLevel): boolean =>
  CONDITION_PRIORITY[condition] >= CONDITION_PRIORITY[minCondition];

export const normalizeWeights = (preferences: UserPreferences) => {
  const total =
    preferences.priceWeight +
    preferences.conditionWeight +
    preferences.shippingWeight +
    preferences.trustWeight;

  const safeTotal = total <= 0 ? 1 : total;

  return {
    price: preferences.priceWeight / safeTotal,
    condition: preferences.conditionWeight / safeTotal,
    shipping: preferences.shippingWeight / safeTotal,
    trust: preferences.trustWeight / safeTotal,
  };
};

export const safeNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
