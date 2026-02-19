import { safeNumber } from '../constants';

interface AladinUsedChannel {
  itemCount?: number;
  minPrice?: number;
  link?: string;
}

interface AladinUsedList {
  aladinUsed?: AladinUsedChannel;
  userUsed?: AladinUsedChannel;
  spaceUsed?: AladinUsedChannel;
}

interface AladinSubInfo {
  usedList?: AladinUsedList;
}

export interface AladinItem {
  itemId?: number;
  title: string;
  author?: string;
  isbn13?: string;
  priceSales?: number;
  priceStandard?: number;
  stockStatus?: string;
  cover?: string;
  link?: string;
  customerReviewRank?: number;
  mallType?: string;
  pubDate?: string;
  subInfo?: AladinSubInfo;
}

interface AladinSearchResponse {
  item?: AladinItem[];
  totalResults?: number;
  errorCode?: number;
  errorMessage?: string;
}

interface SearchAladinOptions {
  queryType?: 'Title' | 'Keyword' | 'Author' | 'Publisher';
  searchTarget?: 'Book' | 'Foreign' | 'Used' | 'All';
  sort?: 'Accuracy' | 'PublishTime' | 'Title' | 'SalesPoint' | 'CustomerRating';
}

const ALADIN_API_BASE = '/aladin-api';

const getApiKey = () => (import.meta.env.VITE_ALADIN_TTB_KEY ?? '').trim();

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('알라딘 응답이 늦어 잠시 후 다시 시도해 주세요.')), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const requestAladin = async (endpoint: string, params: URLSearchParams): Promise<AladinSearchResponse> => {
  const url = `${ALADIN_API_BASE}/${endpoint}?${params.toString()}`;

  const response = await withTimeout(fetch(url), 9000);

  if (!response.ok) {
    throw new Error(`알라딘 연결 오류 (${response.status})`);
  }

  const data = (await response.json()) as AladinSearchResponse;

  if (data.errorCode) {
    throw new Error(data.errorMessage || `알라딘 오류 코드: ${data.errorCode}`);
  }

  return data;
};

export const searchAladinItems = async (
  query: string,
  maxResults = 30,
  options: SearchAladinOptions = {},
): Promise<AladinItem[]> => {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  const params = new URLSearchParams({
    TTBKey: apiKey,
    Query: query,
    QueryType: options.queryType ?? 'Title',
    SearchTarget: options.searchTarget ?? 'Book',
    MaxResults: String(Math.min(Math.max(maxResults, 1), 50)),
    Start: '1',
    Sort: options.sort ?? 'Accuracy',
    Cover: 'MidBig',
    Output: 'JS',
    Version: '20131101',
    outofStockfilter: '1',
    OptResult: 'usedList',
  });

  const data = await requestAladin('ItemSearch.aspx', params);

  const items = Array.isArray(data.item) ? data.item : [];

  return items.filter((item) => {
    const sales = safeNumber(item.priceSales, 0);
    const standard = safeNumber(item.priceStandard, 0);
    return sales > 0 || standard > 0;
  });
};

export const lookupAladinItemByItemId = async (itemId: number): Promise<AladinItem | null> => {
  const apiKey = getApiKey();
  if (!apiKey || !Number.isFinite(itemId) || itemId <= 0) return null;

  const params = new URLSearchParams({
    TTBKey: apiKey,
    ItemIdType: 'ItemId',
    ItemId: String(itemId),
    Cover: 'MidBig',
    Output: 'JS',
    Version: '20131101',
    OptResult: 'usedList',
  });

  const data = await requestAladin('ItemLookUp.aspx', params);
  const items = Array.isArray(data.item) ? data.item : [];
  return items[0] ?? null;
};

export const lookupAladinItemByIsbn13 = async (isbn13: string): Promise<AladinItem | null> => {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const normalized = isbn13.replace(/[^0-9Xx]/g, '');
  if (normalized.length < 10) return null;

  const params = new URLSearchParams({
    TTBKey: apiKey,
    ItemIdType: normalized.length === 13 ? 'ISBN13' : 'ISBN',
    ItemId: normalized,
    Cover: 'MidBig',
    Output: 'JS',
    Version: '20131101',
    OptResult: 'usedList',
  });

  const data = await requestAladin('ItemLookUp.aspx', params);
  const items = Array.isArray(data.item) ? data.item : [];
  return items[0] ?? null;
};

export const extractAladinUsedChannels = (item: AladinItem): AladinUsedList => item.subInfo?.usedList ?? {};
