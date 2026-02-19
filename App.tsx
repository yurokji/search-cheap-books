import React, { useState } from 'react';
import { Layout } from './components/Layout';
import { SearchAndPreferences } from './components/SearchAndPreferences';
import { AnalysisResult } from './components/AnalysisResult';
import { IdentityOverrideModal } from './components/IdentityOverrideModal';
import { DEFAULT_PREFERENCES } from './constants';
import {
  BookDecision,
  BookIdentityOverride,
  DecisionResult,
  SearchExecutionStats,
  UserPreferences,
} from './types';
import { analyzeBookDecisions } from './services/decisionSystemService';

export default function App() {
  const [queryInput, setQueryInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [stats, setStats] = useState<SearchExecutionStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [identityOverrides, setIdentityOverrides] = useState<Record<string, BookIdentityOverride>>({});
  const [editingDecision, setEditingDecision] = useState<BookDecision | null>(null);

  const runAnalysis = async (overrideMap: Record<string, BookIdentityOverride>) => {
    if (!queryInput.trim()) return;

    setIsSearching(true);
    setError(null);

    try {
      const response = await analyzeBookDecisions(queryInput, preferences, overrideMap);
      setResult(response.result);
      setStats(response.stats);
    } catch (err) {
      const message = err instanceof Error ? err.message : '책 정보를 불러오다 문제가 생겼습니다.';
      setError(message);
      setResult(null);
      setStats(null);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = async () => {
    await runAnalysis(identityOverrides);
  };

  const handleApplyIdentityOverride = async (
    queryNormalized: string,
    override: BookIdentityOverride | null,
  ) => {
    const nextOverrides = { ...identityOverrides };

    if (!override) {
      delete nextOverrides[queryNormalized];
    } else {
      nextOverrides[queryNormalized] = override;
    }

    setIdentityOverrides(nextOverrides);
    await runAnalysis(nextOverrides);
    setEditingDecision(null);
  };

  return (
    <Layout>
      <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">책은 싸게 사는 거임</h1>
        <p className="mt-3 max-w-3xl text-slate-600">
          중고책이든 원서든 무조건 최저가로 묶어줌
        </p>
      </section>

      <SearchAndPreferences
        queryInput={queryInput}
        setQueryInput={setQueryInput}
        onSearch={handleSearch}
        isSearching={isSearching}
        preferences={preferences}
        setPreferences={setPreferences}
      />

      {error && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      {isSearching && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-teal-700" />
          <h3 className="text-lg font-semibold text-slate-800">책값 찾는 중</h3>
          <p className="mt-1 text-sm text-slate-500">가격과 상태를 모아서 어떤 선택이 좋은지 계산하고 있어요.</p>
        </div>
      )}

      {!isSearching && result && (
        <AnalysisResult
          result={result}
          stats={stats}
          onEditIdentity={(decision) => setEditingDecision(decision)}
        />
      )}

      <IdentityOverrideModal
        decision={editingDecision}
        isApplying={isSearching}
        onClose={() => setEditingDecision(null)}
        onApply={handleApplyIdentityOverride}
      />
    </Layout>
  );
}
