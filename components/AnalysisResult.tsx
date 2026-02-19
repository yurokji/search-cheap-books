import React, { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CONDITION_DISPLAY_LABEL, formatCurrency, toPercent } from '../constants';
import { BookDecision, DecisionResult, Offer, SearchExecutionStats } from '../types';
import { allocateBundledShipping, describeSource } from '../services/decisionSystemService';

interface Props {
  result: DecisionResult;
  stats: SearchExecutionStats | null;
  onEditIdentity: (decision: BookDecision) => void;
}

const ACTION_LABEL: Record<string, string> = {
  BUY_USED: '중고 구매',
  BUY_NEW: '신간 구매',
  WAIT: '대기',
};

const ACTION_STYLE: Record<string, string> = {
  BUY_USED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  BUY_NEW: 'bg-sky-100 text-sky-800 border-sky-200',
  WAIT: 'bg-amber-100 text-amber-800 border-amber-200',
};

const CONDITION_STYLE: Record<string, string> = {
  최상: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  상: 'bg-teal-100 text-teal-800 border-teal-200',
  중: 'bg-amber-100 text-amber-800 border-amber-200',
  하: 'bg-rose-100 text-rose-800 border-rose-200',
};

const SOURCE_LABEL: Record<string, string> = {
  ALADIN_API: '알라딘',
  WEB_CRAWLER: '다른 판매처',
  AMAZON_CRAWLER: '아마존',
};

const SOURCE_BADGE_STYLE: Record<string, string> = {
  ALADIN_API: 'border-sky-200 bg-sky-50 text-sky-800',
  WEB_CRAWLER: 'border-violet-200 bg-violet-50 text-violet-800',
  AMAZON_CRAWLER: 'border-amber-200 bg-amber-50 text-amber-800',
};

const SOURCE_DOT_STYLE: Record<string, string> = {
  ALADIN_API: 'bg-sky-500',
  WEB_CRAWLER: 'bg-violet-500',
  AMAZON_CRAWLER: 'bg-amber-500',
};

const SHIPPING_NOTE_STYLE = (note?: string) => {
  if (!note) return 'border-slate-200 bg-slate-50 text-slate-700';
  if (note.includes('묶음')) return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (note.includes('원래 배송비 없음')) return 'border-sky-200 bg-sky-50 text-sky-800';
  return 'border-slate-200 bg-slate-50 text-slate-700';
};

const CONDITION_VALUE: Record<string, number> = {
  최상: 4,
  상: 3,
  중: 2,
  하: 1,
};

const STRATEGY_PRESETS = [
  { id: 'PRICE_FIRST', label: '최저가 중심', weights: { price: 0.55, condition: 0.2, shipping: 0.1, trust: 0.15 } },
  { id: 'QUALITY_FIRST', label: '품질 중심', weights: { price: 0.2, condition: 0.5, shipping: 0.1, trust: 0.2 } },
  { id: 'SHIPPING_FIRST', label: '배송 중심', weights: { price: 0.25, condition: 0.15, shipping: 0.45, trust: 0.15 } },
  { id: 'BALANCED', label: '균형형', weights: { price: 0.35, condition: 0.3, shipping: 0.2, trust: 0.15 } },
] as const;

const normalizeMetric = (value: number, min: number, max: number, reverse = false) => {
  if (max <= min) return 1;
  const normalized = (value - min) / (max - min);
  const v = reverse ? 1 - normalized : normalized;
  return Math.max(0, Math.min(1, v));
};

const averageConditionLabel = (value: number) => {
  if (value >= 3.5) return '최상급';
  if (value >= 2.5) return '상급';
  if (value >= 1.5) return '중급';
  return '하급';
};

const buildStrategyComparisons = (decisions: BookDecision[]) => {
  const eligible = decisions.filter((decision) => decision.consideredOffers.length > 0);
  if (eligible.length === 0) return [];

  const result = STRATEGY_PRESETS.map((strategy) => {
    const selected: Array<{ decision: BookDecision; offer: Offer; score: number }> = [];

    for (const decision of eligible) {
      const offers = decision.consideredOffers;
      const totals = offers.map((offer) => offer.price + offer.shippingCost);
      const shippingDays = offers.map((offer) => offer.shippingDays);
      const minTotal = Math.min(...totals);
      const maxTotal = Math.max(...totals);
      const minShipping = Math.min(...shippingDays);
      const maxShipping = Math.max(...shippingDays);

      const scored = offers
        .map((offer) => {
          const totalCost = offer.price + offer.shippingCost;
          const score =
            normalizeMetric(totalCost, minTotal, maxTotal, true) * strategy.weights.price +
            (CONDITION_VALUE[offer.condition] / 4) * strategy.weights.condition +
            normalizeMetric(offer.shippingDays, minShipping, maxShipping, true) * strategy.weights.shipping +
            Math.max(0, Math.min(1, offer.trustScore)) * strategy.weights.trust;
          return { offer, score };
        })
        .sort((a, b) => b.score - a.score);

      if (scored[0]) {
        selected.push({ decision, offer: scored[0].offer, score: scored[0].score });
      }
    }

    const offers = selected.map((row) => row.offer);
    const shippingMap = allocateBundledShipping(offers);
    const subtotal = offers.reduce((sum, offer) => sum + offer.price, 0);
    const shipping = offers.reduce((sum, offer) => sum + (shippingMap.get(offer.id) ?? offer.shippingCost), 0);
    const total = subtotal + shipping;
    const avgConditionRaw =
      offers.length > 0 ? offers.reduce((sum, offer) => sum + CONDITION_VALUE[offer.condition], 0) / offers.length : 0;
    const avgShippingDays =
      offers.length > 0 ? offers.reduce((sum, offer) => sum + offer.shippingDays, 0) / offers.length : 0;

    return {
      id: strategy.id,
      label: strategy.label,
      subtotal,
      shipping,
      total,
      avgConditionRaw,
      avgConditionLabel: averageConditionLabel(avgConditionRaw),
      avgShippingDays,
      coveredCount: offers.length,
      items: selected.map((row) => ({
        queryId: row.decision.queryId,
        queryTitle: row.decision.queryTitle,
        vendor: row.offer.vendor,
        sellerName: row.offer.sellerName,
        condition: row.offer.condition,
        shippingDays: row.offer.shippingDays,
        totalPrice: row.offer.price + (shippingMap.get(row.offer.id) ?? row.offer.shippingCost),
      })),
    };
  });

  return result.sort((a, b) => a.total - b.total);
};

const findRecommendedOffer = (offers: Offer[], offerId?: string) => offers.find((offer) => offer.id === offerId);
const resolveSourceLabel = (source: Offer['source'], vendor?: string) =>
  source === 'AMAZON_CRAWLER' && vendor?.toLowerCase().includes('jp') ? '아마존 JP' : SOURCE_LABEL[source];

export const AnalysisResult: React.FC<Props> = ({ result, stats, onEditIdentity }) => {
  if (result.decisions.length === 0) return null;
  const bundle = result.bundleOptimization;
  const strategyComparisons = useMemo(() => buildStrategyComparisons(result.decisions), [result.decisions]);
  const bundleExpression = bundle
    ? `${bundle.items
        .map(
          (item) =>
            `${item.queryTitle}(${resolveSourceLabel(item.source, item.vendor)}/${item.sellerName} ${formatCurrency(item.totalPrice)}${item.shippingNote ? `, ${item.shippingNote}` : ''})`,
        )
        .join(' + ')} = ${formatCurrency(bundle.total)}`
    : '';

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">추천 결과 요약</h2>
            <p className="text-sm text-slate-500">
              {result.decisions.length}권 확인 완료 · {new Date(result.requestedAt).toLocaleString('ko-KR')}
            </p>
          </div>
          {stats && (
            <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
              알라딘 {stats.sourceStats.aladinApiOffers}건 / 다른 판매처 {stats.sourceStats.crawlerOffers}건 / 아마존(글로벌·JP) {stats.sourceStats.amazonOffers}건
            </div>
          )}
        </div>

        {result.globalWarnings.length > 0 && (
          <div className="mt-4 space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {result.globalWarnings.map((warning, idx) => (
              <p key={`${warning}-${idx}`}>• {warning}</p>
            ))}
          </div>
        )}
      </div>

      {bundle && (
        <div className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 via-cyan-50 to-white p-5">
          <h3 className="mb-2 text-lg font-bold text-teal-900">여러 권 한꺼번에 살 때 최저가</h3>
          <div className="grid gap-3 text-sm text-teal-900 md:grid-cols-5">
            <div className="rounded-lg border border-teal-100 bg-white p-3">도서 합계: {formatCurrency(bundle.subtotal)}</div>
            <div className="rounded-lg border border-teal-100 bg-white p-3">묶음 배송비: {formatCurrency(bundle.shipping)}</div>
            <div className="rounded-lg border border-teal-200 bg-teal-900 p-3 font-semibold text-white">총액: {formatCurrency(bundle.total)}</div>
            <div className="rounded-lg border border-teal-100 bg-white p-3">절감액: {formatCurrency(bundle.savingsVsIndividual)}</div>
            <div className="rounded-lg border border-teal-100 bg-white p-3">
              탐색 조합: {bundle.scannedCombinations}개
              {bundle.truncatedByCap ? <span className="ml-1 text-xs text-amber-700">(상한 적용)</span> : null}
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-teal-200 bg-white p-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-teal-700">한 줄 계산식</p>
            <p className="text-sm font-medium text-slate-800">{bundleExpression}</p>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-sky-800">
              <span className="h-2 w-2 rounded-full bg-sky-500" />
              알라딘
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              아마존 / Amazon JP
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-violet-800">
              <span className="h-2 w-2 rounded-full bg-violet-500" />
              기타 판매처
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              배송비 묶음 적용
            </span>
          </div>

          <div className="mt-3 text-sm text-teal-900">
            {bundle.rationale.map((line, idx) => (
              <p key={`${line}-${idx}`}>• {line}</p>
            ))}
          </div>

          {bundle.nextBestCandidate && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">차선책(품절 대비)</p>
              <p>
                2순위 총액 {formatCurrency(bundle.nextBestCandidate.total)} · 최적안 대비{' '}
                {formatCurrency(bundle.nextBestCandidate.savingsVsBest)} 추가
              </p>
            </div>
          )}

          <div className="mt-4 overflow-x-auto rounded-xl border border-teal-200 bg-white">
            <table className="min-w-[1060px] w-full text-sm">
              <thead className="bg-teal-100/70 text-teal-900">
                <tr>
                  <th className="px-3 py-2 text-left">대상 도서</th>
                  <th className="px-3 py-2 text-left">판매처/셀러</th>
                  <th className="px-3 py-2 text-left">셀러 ID</th>
                  <th className="px-3 py-2 text-left">출처</th>
                  <th className="px-3 py-2 text-right">상품가</th>
                  <th className="px-3 py-2 text-right">배송비(원래)</th>
                  <th className="px-3 py-2 text-right">배송비(묶음반영)</th>
                  <th className="px-3 py-2 text-left">배송 반영</th>
                  <th className="px-3 py-2 text-right">합계금액</th>
                  <th className="px-3 py-2 text-left">구매</th>
                </tr>
              </thead>
              <tbody>
                {bundle.items.map((item) => (
                  <tr key={`${item.queryId}-${item.offerId}`} className="border-t border-teal-100">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{item.queryTitle}</div>
                      <div className="text-xs text-slate-500">{item.matchedTitle}</div>
                      {item.isbn13 && <div className="text-[11px] text-slate-400">ISBN13 {item.isbn13}</div>}
                    </td>
                    <td className="px-3 py-2 text-slate-800">
                      <div>{item.vendor}</div>
                      <div className="text-xs text-slate-500">{item.sellerName}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-600">{item.sellerKey}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${SOURCE_BADGE_STYLE[item.source]}`}>
                        <span className={`mr-1 h-2 w-2 rounded-full ${SOURCE_DOT_STYLE[item.source]}`} />
                        {resolveSourceLabel(item.source, item.vendor)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">{formatCurrency(item.price)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(item.shippingCost)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-700">{formatCurrency(item.bundledShippingCost)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${SHIPPING_NOTE_STYLE(item.shippingNote)}`}>
                        <span className="mr-1 h-2 w-2 rounded-full bg-current opacity-70" />
                        {item.shippingNote ?? '반영 정보 없음'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-900">{formatCurrency(item.totalPrice)}</td>
                    <td className="px-3 py-2">
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex rounded-md border border-teal-300 bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-100"
                        >
                          상품 열기
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">링크 없음</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {strategyComparisons.length > 0 && (
            <div className="mt-4 rounded-xl border border-teal-200 bg-white p-3">
              <p className="mb-2 text-sm font-semibold text-teal-900">방법별 자동 비교 (우선순위 선택 없음)</p>
              <div className="overflow-x-auto">
                <table className="min-w-[980px] w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left">비교 방식</th>
                      <th className="px-3 py-2 text-right">총액</th>
                      <th className="px-3 py-2 text-right">도서합계</th>
                      <th className="px-3 py-2 text-right">배송비</th>
                      <th className="px-3 py-2 text-right">평균 품질</th>
                      <th className="px-3 py-2 text-right">평균 배송일</th>
                      <th className="px-3 py-2 text-left">책별 상세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {strategyComparisons.map((row, idx) => (
                      <tr key={`strategy-${row.id}`} className={`border-t border-slate-100 ${idx === 0 ? 'bg-emerald-50/70' : 'bg-white'}`}>
                        <td className="px-3 py-2 font-semibold text-slate-900">
                          {row.label}
                          {idx === 0 && <span className="ml-2 rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-800">총액 최저</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-900">{formatCurrency(row.total)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(row.subtotal)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(row.shipping)}</td>
                        <td className="px-3 py-2 text-right">{row.avgConditionLabel} ({row.avgConditionRaw.toFixed(1)})</td>
                        <td className="px-3 py-2 text-right">{row.avgShippingDays.toFixed(1)}일</td>
                        <td className="px-3 py-2 text-xs text-slate-600">
                          {row.items.map((item) => (
                            <div key={`${row.id}-${item.queryId}`}>
                              {item.queryTitle}: {item.condition} / {item.shippingDays}일 / {formatCurrency(item.totalPrice)}
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-5">
        {result.decisions.map((decision) => {
          const recommendedOffer = findRecommendedOffer(decision.consideredOffers, decision.recommendedOfferId);
          const nextBestOffer = findRecommendedOffer(decision.consideredOffers, decision.nextBestOfferId);
          const scoreMap = new Map(decision.scoreBreakdown.map((item) => [item.offerId, item]));
          const sortedOffers = [...decision.consideredOffers].sort((a, b) => {
            const scoreA = scoreMap.get(a.id)?.totalScore ?? 0;
            const scoreB = scoreMap.get(b.id)?.totalScore ?? 0;
            return scoreB - scoreA;
          });

          return (
            <article key={decision.queryId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="grid gap-4 border-b border-slate-200 bg-slate-50 p-5 lg:grid-cols-[220px_1fr]">
                <div className="flex gap-4 lg:block">
                  <div className="relative h-32 w-24 flex-none overflow-hidden rounded-md bg-slate-200 lg:h-40 lg:w-28">
                    {decision.coverUrl ? (
                      <img src={decision.coverUrl} alt={decision.matchedTitle} className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center px-2 text-center text-xs text-slate-500">
                        표지 없음
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => onEditIdentity(decision)}
                      className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full border border-white/70 bg-white/90 text-slate-700 shadow transition hover:bg-white"
                      title="책 정보 수정"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                      </svg>
                    </button>
                  </div>
                  <div>
                    <div className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${ACTION_STYLE[decision.action]}`}>
                      {ACTION_LABEL[decision.action]}
                    </div>
                    <h3 className="mt-2 text-lg font-bold text-slate-900">{decision.matchedTitle}</h3>
                    <p className="text-sm text-slate-600">입력: {decision.queryTitle}</p>
                    <button
                      type="button"
                      onClick={() => onEditIdentity(decision)}
                      className="mt-2 inline-flex items-center gap-1 rounded-md border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                    >
                      책이 다르면 여기서 수정
                    </button>
                    {decision.appliedOverride && (
                      <p className="mt-1 inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                        수동 교정 적용됨
                      </p>
                    )}
                    {decision.author && <p className="text-sm text-slate-500">저자: {decision.author}</p>}
                    {decision.isbn13 && <p className="text-xs text-slate-400">ISBN13: {decision.isbn13}</p>}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-semibold">추천 확신도</span>
                      <span className="font-semibold text-teal-700">{toPercent(decision.confidence)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200">
                      <div className="h-2 rounded-full bg-teal-700" style={{ width: `${Math.round(decision.confidence * 100)}%` }} />
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                      <p className="mb-1 font-semibold">추천 판매처</p>
                      {recommendedOffer ? (
                        <>
                          <p>{recommendedOffer.vendor} / {recommendedOffer.sellerName}</p>
                          <p className="font-semibold text-slate-900">
                            {formatCurrency(recommendedOffer.price + recommendedOffer.shippingCost)}
                          </p>
                          <p className="text-xs text-slate-500">{describeSource(recommendedOffer)} · {recommendedOffer.shippingDays}일</p>
                          {nextBestOffer && (
                            <p className="mt-1 text-xs text-slate-500">
                              차선책: {nextBestOffer.vendor} / {nextBestOffer.sellerName}{' '}
                              {decision.nextBestDelta !== undefined
                                ? `(총액 ${decision.nextBestDelta >= 0 ? '+' : '-'}${formatCurrency(Math.abs(decision.nextBestDelta))})`
                                : ''}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-slate-500">추천할 판매처를 찾지 못했어요</p>
                      )}
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                      <p className="mb-1 font-semibold">가격 흐름</p>
                      <p className="text-slate-900">{decision.priceForecast.signal}</p>
                      <p className="text-xs text-slate-600">예상 변동 {decision.priceForecast.expectedChangePct.toFixed(1)}%</p>
                      <p className="text-xs text-slate-500">희소도 {decision.priceForecast.scarcity}</p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                      <p className="mb-1 font-semibold">추가 안내</p>
                      <p className="text-xs text-slate-600">{decision.fallbackMessage ?? '해당 없음'}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-5 p-5 lg:grid-cols-3">
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 p-3 text-sm">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">추천 근거</p>
                    {decision.reasoning.map((line, idx) => (
                      <p key={`${line}-${idx}`} className="mb-1">• {line}</p>
                    ))}
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3 text-sm">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">장단점 비교</p>
                    {decision.tradeoffs.map((line, idx) => (
                      <p key={`${line}-${idx}`} className="mb-1">• {line}</p>
                    ))}
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3 text-sm">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">주의할 점</p>
                    {decision.risks.map((line, idx) => (
                      <p key={`${line}-${idx}`} className="mb-1">• {line}</p>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <div className="mb-4 h-44 rounded-xl border border-slate-200 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">가격 예측 (6개월)</p>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={decision.priceForecast.history}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                        <YAxis hide />
                        <Tooltip formatter={(value: number) => [formatCurrency(value), '평균가']} />
                        <Line
                          type="monotone"
                          dataKey="averagePrice"
                          stroke="#0f766e"
                          strokeWidth={2.5}
                          dot={{ r: 3, fill: '#0f766e' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-[760px] w-full text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-3 py-2 text-left">판매처/판매자</th>
                          <th className="px-3 py-2 text-left">출처</th>
                          <th className="px-3 py-2 text-left">상태</th>
                          <th className="px-3 py-2 text-right">상품가</th>
                          <th className="px-3 py-2 text-right">배송비</th>
                          <th className="px-3 py-2 text-right">총액</th>
                          <th className="px-3 py-2 text-right">배송일</th>
                          <th className="px-3 py-2 text-right">판매자 평판</th>
                          <th className="px-3 py-2 text-right">추천점수</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedOffers.map((offer) => {
                          const score = scoreMap.get(offer.id);
                          const isRecommended = offer.id === decision.recommendedOfferId;
                          return (
                            <tr key={offer.id} className={isRecommended ? 'bg-emerald-50' : 'bg-white'}>
                              <td className="px-3 py-2">
                                <div className="font-medium text-slate-900">{offer.vendor}</div>
                                <div className="text-xs text-slate-500">{offer.sellerName}</div>
                              </td>
                              <td className="px-3 py-2 text-xs text-slate-600">{describeSource(offer)}</td>
                              <td className="px-3 py-2">
                                <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${CONDITION_STYLE[offer.condition]}`}>
                                  {CONDITION_DISPLAY_LABEL[offer.condition]}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right">{formatCurrency(offer.price)}</td>
                              <td className="px-3 py-2 text-right">{formatCurrency(offer.shippingCost)}</td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-900">
                                {formatCurrency(offer.price + offer.shippingCost)}
                              </td>
                              <td className="px-3 py-2 text-right">{offer.shippingDays}일</td>
                              <td className="px-3 py-2 text-right">{toPercent(offer.trustScore)}</td>
                              <td className="px-3 py-2 text-right font-semibold text-teal-700">
                                {score ? `${Math.round(score.totalScore * 100)}점` : '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
