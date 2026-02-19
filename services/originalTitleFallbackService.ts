import { clamp } from '../constants';
import { computeTitleMatchConfidence } from './titleResolver';

interface ResolveOriginalTitleFallbackInput {
  title?: string;
  author?: string;
  isbn13?: string;
  pubDate?: string;
}

interface ResolvedOriginalTitleFallback {
  originalTitle: string;
  confidence: number;
  source: 'GOOGLE_BOOKS' | 'OPEN_LIBRARY';
  reason: string;
}

interface Candidate {
  title: string;
  author?: string;
  language?: string;
  year?: number;
  score: number;
  source: 'GOOGLE_BOOKS' | 'OPEN_LIBRARY';
  reason: string;
}

const GOOGLE_BOOKS_API = 'https://www.googleapis.com/books/v1/volumes';
const OPEN_LIBRARY_API = 'https://openlibrary.org/search.json';
const GOOGLE_BOOKS_API_KEY = (import.meta.env.VITE_GOOGLE_BOOKS_API_KEY ?? '').trim();
const CACHE_TTL_MS = 1000 * 60 * 30;

const cache = new Map<string, { at: number; value: ResolvedOriginalTitleFallback | null }>();

const normalizeIsbn = (value?: string): string | undefined => {
  if (!value) return undefined;
  const normalized = value.replace(/[^0-9Xx]/g, '').toUpperCase();
  return normalized.length >= 10 ? normalized : undefined;
};

const normalizePersonKey = (value?: string): string =>
  (value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s'"`’‘,./\\|()[\]{}\-_:;!?~]/g, '');

const extractYear = (value?: string): number | undefined => {
  if (!value) return undefined;
  const match = value.match(/\b(19|20)\d{2}\b/);
  if (!match) return undefined;
  const year = Number(match[0]);
  return Number.isFinite(year) ? year : undefined;
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('original-title-fallback-timeout')), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const scoreCandidate = (params: {
  seedTitle: string;
  seedAuthor?: string;
  sourceYear?: number;
  seedIsbn?: string;
  candidateTitle: string;
  candidateAuthor?: string;
  candidateLanguage?: string;
  candidateYear?: number;
  candidateIsbns?: string[];
}): { score: number; reason: string } => {
  const titleScore = computeTitleMatchConfidence(params.seedTitle, params.candidateTitle);
  const seedAuthorKey = normalizePersonKey(params.seedAuthor);
  const candidateAuthorKey = normalizePersonKey(params.candidateAuthor);
  const authorMatched =
    Boolean(seedAuthorKey) &&
    Boolean(candidateAuthorKey) &&
    (candidateAuthorKey.includes(seedAuthorKey) || seedAuthorKey.includes(candidateAuthorKey));

  const isbnMatched =
    Boolean(params.seedIsbn) &&
    (params.candidateIsbns ?? []).some((isbn) => isbn === params.seedIsbn);

  const language = (params.candidateLanguage ?? '').toLowerCase();
  const nonKoreanBonus = language && language !== 'ko' ? 0.08 : -0.1;
  const authorBonus = authorMatched ? 0.24 : 0;
  const isbnBonus = isbnMatched ? 0.65 : 0;

  let yearBonus = 0;
  if (params.sourceYear && params.candidateYear) {
    if (params.candidateYear <= params.sourceYear + 1) yearBonus = 0.1;
    else if (params.candidateYear > params.sourceYear + 3) yearBonus = -0.08;
  }

  const score = clamp(titleScore * 0.52 + authorBonus + isbnBonus + yearBonus + nonKoreanBonus, 0, 1);

  const reasons: string[] = [];
  if (isbnMatched) reasons.push('ISBN 일치');
  reasons.push(`제목 유사도 ${Math.round(titleScore * 100)}점`);
  if (authorMatched) reasons.push('저자 일치');
  if (params.sourceYear && params.candidateYear) reasons.push(`연도 ${params.candidateYear}`);
  return { score, reason: reasons.join(' · ') };
};

const fetchGoogleCandidates = async (input: ResolveOriginalTitleFallbackInput): Promise<Candidate[]> => {
  const seedTitle = input.title?.trim();
  if (!seedTitle) return [];

  const qParts = [
    input.isbn13 ? `isbn:${input.isbn13}` : '',
    `intitle:${seedTitle}`,
    input.author?.trim() ? `inauthor:${input.author.trim()}` : '',
  ].filter(Boolean);
  const q = qParts.join(' ');

  const params = new URLSearchParams({
    q,
    maxResults: '10',
    printType: 'books',
  });
  if (GOOGLE_BOOKS_API_KEY) params.set('key', GOOGLE_BOOKS_API_KEY);

  try {
    const response = await withTimeout(fetch(`${GOOGLE_BOOKS_API}?${params.toString()}`), 7000);
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      items?: Array<{
        volumeInfo?: {
          title?: string;
          authors?: string[];
          language?: string;
          publishedDate?: string;
          industryIdentifiers?: Array<{ identifier?: string }>;
        };
      }>;
    };

    const sourceYear = extractYear(input.pubDate);
    const seedIsbn = normalizeIsbn(input.isbn13);

    return (payload.items ?? [])
      .map((item) => {
        const volume = item.volumeInfo;
        const title = volume?.title?.trim();
        if (!title) return null;
        const author = volume?.authors?.[0];
        const year = extractYear(volume?.publishedDate);
        const candidateIsbns = (volume?.industryIdentifiers ?? [])
          .map((row) => normalizeIsbn(row.identifier))
          .filter((isbn): isbn is string => Boolean(isbn));

        const { score, reason } = scoreCandidate({
          seedTitle,
          seedAuthor: input.author,
          sourceYear,
          seedIsbn,
          candidateTitle: title,
          candidateAuthor: author,
          candidateLanguage: volume?.language,
          candidateYear: year,
          candidateIsbns,
        });

        return {
          title,
          author,
          language: volume?.language,
          year,
          score,
          source: 'GOOGLE_BOOKS' as const,
          reason,
        };
      })
      .filter((row): row is Candidate => Boolean(row))
      .filter((row) => (row.language ?? '').toLowerCase() !== 'ko');
  } catch {
    return [];
  }
};

const fetchOpenLibraryCandidates = async (input: ResolveOriginalTitleFallbackInput): Promise<Candidate[]> => {
  const seedTitle = input.title?.trim();
  if (!seedTitle) return [];

  const params = new URLSearchParams({
    title: seedTitle,
    limit: '10',
  });
  if (input.author?.trim()) params.set('author', input.author.trim());

  try {
    const response = await withTimeout(fetch(`${OPEN_LIBRARY_API}?${params.toString()}`), 7000);
    if (!response.ok) return [];

    const payload = (await response.json()) as {
      docs?: Array<{
        title?: string;
        author_name?: string[];
        first_publish_year?: number;
        language?: string[];
        isbn?: string[];
      }>;
    };

    const sourceYear = extractYear(input.pubDate);
    const seedIsbn = normalizeIsbn(input.isbn13);

    return (payload.docs ?? [])
      .map((doc) => {
        const title = doc.title?.trim();
        if (!title) return null;
        const author = doc.author_name?.[0];
        const language = doc.language?.[0];
        const year = doc.first_publish_year;
        const candidateIsbns = (doc.isbn ?? []).map((isbn) => normalizeIsbn(isbn)).filter((isbn): isbn is string => Boolean(isbn));

        const { score, reason } = scoreCandidate({
          seedTitle,
          seedAuthor: input.author,
          sourceYear,
          seedIsbn,
          candidateTitle: title,
          candidateAuthor: author,
          candidateLanguage: language,
          candidateYear: year,
          candidateIsbns,
        });

        return {
          title,
          author,
          language,
          year,
          score,
          source: 'OPEN_LIBRARY' as const,
          reason,
        };
      })
      .filter((row): row is Candidate => Boolean(row))
      .filter((row) => (row.language ?? '').toLowerCase() !== 'kor');
  } catch {
    return [];
  }
};

export const resolveOriginalTitleFallback = async (
  input: ResolveOriginalTitleFallbackInput,
): Promise<ResolvedOriginalTitleFallback | null> => {
  const key = JSON.stringify({
    title: input.title?.trim() ?? '',
    author: input.author?.trim() ?? '',
    isbn13: normalizeIsbn(input.isbn13) ?? '',
    pubDate: input.pubDate ?? '',
  });

  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const [google, openLibrary] = await Promise.all([
    fetchGoogleCandidates(input),
    fetchOpenLibraryCandidates(input),
  ]);

  const candidate = [...google, ...openLibrary].sort((a, b) => b.score - a.score)[0];
  if (!candidate || candidate.score < 0.58) {
    cache.set(key, { at: Date.now(), value: null });
    return null;
  }

  const value: ResolvedOriginalTitleFallback = {
    originalTitle: candidate.title,
    confidence: candidate.score,
    source: candidate.source,
    reason: candidate.reason,
  };
  cache.set(key, { at: Date.now(), value });
  return value;
};
