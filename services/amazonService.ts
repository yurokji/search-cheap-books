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
}

const AMAZON_CRAWLER_API_BASE = (import.meta.env.VITE_AMAZON_CRAWLER_API_BASE ?? '').trim();

const parseAmazonResponse = (payload: unknown): AmazonOfferRaw[] => {
  if (Array.isArray(payload)) return payload as AmazonOfferRaw[];

  if (payload && typeof payload === 'object' && 'offers' in payload) {
    const offers = (payload as { offers?: unknown }).offers;
    if (Array.isArray(offers)) return offers as AmazonOfferRaw[];
  }

  return [];
};

export const fetchAmazonOffers = async (query: string): Promise<AmazonOfferRaw[]> => {
  if (!AMAZON_CRAWLER_API_BASE) {
    return [];
  }

  try {
    const url = `${AMAZON_CRAWLER_API_BASE.replace(/\/$/, '')}/offers?query=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    if (!response.ok) return [];

    const payload = (await response.json()) as unknown;
    return parseAmazonResponse(payload);
  } catch {
    return [];
  }
};
