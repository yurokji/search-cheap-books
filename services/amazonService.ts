import { AmazonMarket } from '../types';

export interface AmazonOfferRaw {
  title: string;
  author?: string;
  isbn13?: string;
  sellerName?: string;
  vendor?: string;
  price: number;
  shippingCost?: number;
  shippingDays?: number;
  conditionText?: string;
  notes?: string;
  isUsed?: boolean;
  inStock?: boolean;
  url?: string;
  coverUrl?: string;
  market?: AmazonMarket;
  currency?: 'KRW' | 'JPY';
}

const AMAZON_CRAWLER_API_BASE = (import.meta.env.VITE_AMAZON_CRAWLER_API_BASE ?? '').trim();
const AMAZON_JP_CRAWLER_API_BASE = (import.meta.env.VITE_AMAZON_JP_CRAWLER_API_BASE ?? '').trim();
const SHARED_CRAWLER_API_BASE = (import.meta.env.VITE_CRAWLER_API_BASE ?? '').trim();

const parseAmazonResponse = (payload: unknown): AmazonOfferRaw[] => {
  if (Array.isArray(payload)) return payload as AmazonOfferRaw[];

  if (payload && typeof payload === 'object' && 'offers' in payload) {
    const offers = (payload as { offers?: unknown }).offers;
    if (Array.isArray(offers)) return offers as AmazonOfferRaw[];
  }

  return [];
};

const fetchAmazonOffersByMarket = async (
  query: string,
  apiBase: string,
  market: AmazonMarket,
): Promise<AmazonOfferRaw[]> => {
  if (!apiBase) {
    return [];
  }

  try {
    const url = `${apiBase.replace(/\/$/, '')}/offers?query=${encodeURIComponent(query)}&market=${market.toLowerCase()}`;
    const response = await fetch(url);
    if (!response.ok) return [];

    const payload = (await response.json()) as unknown;
    return parseAmazonResponse(payload).map((row) => ({
      ...row,
      market: (row.market as AmazonMarket | undefined) ?? market,
      currency:
        row.currency ??
        ((((row.market as AmazonMarket | undefined) ?? market) === 'JP')
          ? 'JPY'
          : 'KRW'),
    }));
  } catch {
    return [];
  }
};

export const fetchAmazonOffers = async (query: string): Promise<AmazonOfferRaw[]> => {
  const globalBase = AMAZON_CRAWLER_API_BASE || SHARED_CRAWLER_API_BASE;
  const jpBase = AMAZON_JP_CRAWLER_API_BASE || SHARED_CRAWLER_API_BASE;

  const [globalOffers, jpOffers] = await Promise.all([
    fetchAmazonOffersByMarket(query, globalBase, 'GLOBAL'),
    fetchAmazonOffersByMarket(query, jpBase, 'JP'),
  ]);

  const merged = [...globalOffers, ...jpOffers];
  const deduped = new Map<string, AmazonOfferRaw>();

  for (const offer of merged) {
    const key = [offer.market ?? 'GLOBAL', offer.url ?? '', offer.title ?? '', offer.sellerName ?? '', offer.price].join('|');
    if (!deduped.has(key)) deduped.set(key, offer);
  }

  return [...deduped.values()];
};
