import { CONDITION_KEYWORDS } from '../constants';
import { ConditionLevel } from '../types';

const CONDITION_ORDER: ConditionLevel[] = ['최상', '상', '중', '하'];

export interface ConditionInferenceResult {
  condition: ConditionLevel;
  confidence: number;
  reasons: string[];
}

const findConditionByText = (text: string): ConditionInferenceResult | null => {
  const normalized = text.toLowerCase();
  if (!normalized.trim()) return null;

  const hits: Array<{ condition: ConditionLevel; keyword: string }> = [];

  for (const condition of CONDITION_ORDER) {
    for (const keyword of CONDITION_KEYWORDS[condition]) {
      if (normalized.includes(keyword.toLowerCase())) {
        hits.push({ condition, keyword });
      }
    }
  }

  if (!hits.length) return null;

  const scoreMap = new Map<ConditionLevel, number>([
    ['최상', 0],
    ['상', 0],
    ['중', 0],
    ['하', 0],
  ]);

  for (const hit of hits) {
    scoreMap.set(hit.condition, (scoreMap.get(hit.condition) ?? 0) + 1);
  }

  const [bestCondition, bestScore] = [...scoreMap.entries()].sort((a, b) => b[1] - a[1])[0];

  const reasons = hits
    .filter((hit) => hit.condition === bestCondition)
    .slice(0, 2)
    .map((hit) => `"${hit.keyword}" 패턴 감지`);

  const confidence = Math.min(0.95, 0.55 + bestScore * 0.12);

  return {
    condition: bestCondition,
    confidence,
    reasons,
  };
};

export const inferCondition = (
  rawCondition: string | null | undefined,
  notes: string | null | undefined,
  fallback: ConditionLevel = '중',
): ConditionInferenceResult => {
  const combined = `${rawCondition ?? ''} ${notes ?? ''}`.trim();
  const detected = findConditionByText(combined);

  if (detected) {
    return detected;
  }

  if (rawCondition) {
    if (rawCondition.includes('최상')) return { condition: '최상', confidence: 0.72, reasons: ['판매자 상태값 사용'] };
    if (rawCondition.includes('상')) return { condition: '상', confidence: 0.68, reasons: ['판매자 상태값 사용'] };
    if (rawCondition.includes('중')) return { condition: '중', confidence: 0.64, reasons: ['판매자 상태값 사용'] };
    if (rawCondition.includes('하')) return { condition: '하', confidence: 0.62, reasons: ['판매자 상태값 사용'] };
  }

  return {
    condition: fallback,
    confidence: 0.45,
    reasons: ['설명 부족으로 기본 등급 적용'],
  };
};
