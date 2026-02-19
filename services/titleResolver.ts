import { normalizeTitle } from '../constants';

const EDITION_TOKENS = [
  '개정판',
  '증보판',
  '특별판',
  '리커버',
  '양장본',
  'paperback',
  'hardcover',
  'edition',
];

const stripEditionTokens = (value: string): string => {
  let result = value;
  for (const token of EDITION_TOKENS) {
    result = result.replace(new RegExp(token, 'gi'), ' ');
  }
  return result.replace(/\s+/g, ' ').trim();
};

const stripSubtitle = (value: string): string => {
  const idx = value.search(/\s[-:|/]\s|[-:|/]|[–—]/);
  if (idx > 0) {
    return value.slice(0, idx).trim();
  }
  return value.trim();
};

const compact = (value: string): string => value.replace(/\s+/g, '');

const normalizeComparableTitle = (value: string): string =>
  compact(stripEditionTokens(normalizeTitle(value)));

const normalizeComparableHeadTitle = (value: string): string =>
  compact(stripEditionTokens(normalizeTitle(stripSubtitle(value))));

export const isExactTitleMatch = (query: string, candidateTitle: string): boolean => {
  const queryComparable = normalizeComparableTitle(query);
  if (!queryComparable) return false;

  const candidateComparable = normalizeComparableTitle(candidateTitle);
  const candidateHeadComparable = normalizeComparableHeadTitle(candidateTitle);

  return queryComparable === candidateComparable || queryComparable === candidateHeadComparable;
};

const levenshteinDistance = (a: string, b: string): number => {
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = Array.from({ length: b.length + 1 }, () => new Array(a.length + 1).fill(0));

  for (let i = 0; i <= b.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= a.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i += 1) {
    for (let j = 1; j <= a.length; j += 1) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[b.length][a.length];
};

const jaccardTokenSimilarity = (a: string, b: string): number => {
  const tokensA = new Set(a.split(' ').filter(Boolean));
  const tokensB = new Set(b.split(' ').filter(Boolean));

  if (!tokensA.size || !tokensB.size) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection += 1;
  }

  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

export const computeTitleMatchConfidence = (query: string, candidateTitle: string): number => {
  const normalizedQuery = stripEditionTokens(normalizeTitle(query));
  const normalizedCandidateFull = stripEditionTokens(normalizeTitle(candidateTitle));
  const normalizedCandidateHead = stripEditionTokens(normalizeTitle(stripSubtitle(candidateTitle)));

  const candidates = Array.from(new Set([normalizedCandidateFull, normalizedCandidateHead])).filter(Boolean);
  if (!normalizedQuery || candidates.length === 0) return 0;

  const compactQuery = compact(normalizedQuery);
  let best = 0;

  for (const normalizedCandidate of candidates) {
    const compactCandidate = compact(normalizedCandidate);
    if (!compactCandidate) continue;

    if (compactQuery === compactCandidate) return 1;

    const tokenScore = jaccardTokenSimilarity(normalizedQuery, normalizedCandidate);
    const maxLen = Math.max(normalizedQuery.length, normalizedCandidate.length, 1);
    const distance = levenshteinDistance(normalizedQuery, normalizedCandidate);
    const editScore = 1 - distance / maxLen;

    let containmentScore = 0;
    if (compactCandidate.includes(compactQuery) || compactQuery.includes(compactCandidate)) {
      const ratio = Math.min(compactQuery.length, compactCandidate.length) / Math.max(compactQuery.length, compactCandidate.length);
      containmentScore = 0.62 + ratio * 0.32;
    }

    const score = Math.max(containmentScore, tokenScore * 0.45 + editScore * 0.55);
    best = Math.max(best, score);
  }

  return Math.max(0, Math.min(1, best));
};
