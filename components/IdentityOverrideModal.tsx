import React, { useEffect, useMemo, useState } from 'react';
import { BookDecision, BookIdentityOverride } from '../types';

interface Props {
  decision: BookDecision | null;
  isApplying: boolean;
  onClose: () => void;
  onApply: (queryNormalized: string, override: BookIdentityOverride | null) => Promise<void>;
}

const normalizeIsbn = (value: string): string => value.replace(/[^0-9Xx]/g, '').toUpperCase();

export const IdentityOverrideModal: React.FC<Props> = ({ decision, isApplying, onClose, onApply }) => {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn13, setIsbn13] = useState('');

  useEffect(() => {
    if (!decision) return;
    setTitle(decision.appliedOverride?.title ?? decision.matchedTitle ?? '');
    setAuthor(decision.appliedOverride?.author ?? decision.author ?? '');
    setIsbn13(decision.appliedOverride?.isbn13 ?? decision.isbn13 ?? '');
  }, [decision]);

  const validationError = useMemo(() => {
    const normalized = normalizeIsbn(isbn13);
    if (!normalized) return null;
    if (normalized.length !== 10 && normalized.length !== 13) {
      return 'ISBN은 10자리 또는 13자리여야 합니다.';
    }
    return null;
  }, [isbn13]);

  if (!decision) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validationError) return;

    const normalizedIsbn = normalizeIsbn(isbn13);
    const nextOverride: BookIdentityOverride = {
      title: title.trim() || undefined,
      author: author.trim() || undefined,
      isbn13: normalizedIsbn || undefined,
    };

    if (!nextOverride.title && !nextOverride.author && !nextOverride.isbn13) {
      await onApply(decision.queryNormalized, null);
      return;
    }

    await onApply(decision.queryNormalized, nextOverride);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="bg-gradient-to-r from-teal-700 to-cyan-700 px-5 py-4 text-white">
          <h3 className="text-lg font-bold">책 정보 바로잡기</h3>
          <p className="mt-1 text-sm text-white/85">같은 제목의 다른 책이 나오면 제목/저자/ISBN을 입력해 다시 찾아요.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            현재 입력 키워드: <span className="font-semibold text-slate-800">{decision.queryTitle}</span>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            <p className="font-semibold">자동 연계 순서</p>
            <p className="mt-1">1) ISBN 일치 2) 원제(또는 제목) 일치 3) 저자 + 출간년도 근접</p>
            <p className="mt-1">원서가 다르게 붙으면 ISBN을 먼저 넣고, 없으면 제목/저자를 넣어 다시 찾아주세요.</p>
          </div>

          {decision.consideredOffers.length === 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              지금은 자동 매핑이 충분히 맞지 않아 추천을 만들지 못했습니다. ISBN 또는 정확한 저자명을 넣어 다시 시도해 주세요.
            </div>
          )}

          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">제목</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 지식의 기초 / 進化論講義"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">저자</span>
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="예: 나심 니콜라스 탈레브 / 東野圭吾"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">ISBN(10 또는 13)</span>
              <input
                value={isbn13}
                onChange={(e) => setIsbn13(e.target.value)}
                placeholder="예: 9791187142567"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
            </label>
          </div>

          {validationError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{validationError}</div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => void onApply(decision.queryNormalized, null)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              disabled={isApplying}
            >
              수정 지우기
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                disabled={isApplying}
              >
                닫기
              </button>
              <button
                type="submit"
                className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:bg-slate-300"
                disabled={isApplying || Boolean(validationError)}
              >
                {isApplying ? '다시 찾는 중...' : '바꾼 내용으로 다시 찾기'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
