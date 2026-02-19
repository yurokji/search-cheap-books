export interface CrawledOfferRaw {
  title: string;
  author?: string;
  isbn13?: string;
  vendor: string;
  sellerName: string;
  conditionText?: string;
  notes?: string;
  price: number;
  shippingCost?: number;
  shippingDays?: number;
  trustScore?: number;
  isUsed?: boolean;
  inStock?: boolean;
  url?: string;
  coverUrl?: string;
}

const CRAWLER_API_BASE = (import.meta.env.VITE_CRAWLER_API_BASE ?? '').trim();

const parseCrawlerResponse = (payload: unknown): CrawledOfferRaw[] => {
  if (Array.isArray(payload)) return payload as CrawledOfferRaw[];

  if (payload && typeof payload === 'object' && 'offers' in payload) {
    const offers = (payload as { offers?: unknown }).offers;
    if (Array.isArray(offers)) return offers as CrawledOfferRaw[];
  }

  return [];
};

export const fetchCrawledOffers = async (query: string): Promise<CrawledOfferRaw[]> => {
  if (!CRAWLER_API_BASE) {
    return [];
  }

  try {
    const url = `${CRAWLER_API_BASE.replace(/\/$/, '')}/offers?query=${encodeURIComponent(query)}`;
    const response = await fetch(url);

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as unknown;
    const parsed = parseCrawlerResponse(payload);

    return parsed;
  } catch {
    return [];
  }
};
