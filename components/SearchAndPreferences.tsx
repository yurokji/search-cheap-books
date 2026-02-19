import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AmazonUsedConditionLevel, ConditionLevel, UserPreferences } from '../types';
import { CONDITION_DISPLAY_LABEL, formatCurrency } from '../constants';

interface Props {
  queryInput: string;
  setQueryInput: (value: string) => void;
  onSearch: () => void;
  isSearching: boolean;
  preferences: UserPreferences;
  setPreferences: React.Dispatch<React.SetStateAction<UserPreferences>>;
}

interface BookEntry {
  id: string;
  title: string;
  publisher?: string;
  author?: string;
  translator?: string;
  publishedYear?: string;
  isbn?: string;
}

interface DraftMetadataChip {
  field: MetadataFieldKey;
  label: string;
  value: string;
  isSkip: boolean;
}

interface DraftComposerState {
  active: boolean;
  title: string;
  chips: DraftMetadataChip[];
  currentField?: MetadataFieldKey;
  currentValue: string;
}

const fieldLabel = {
  publisher: '출판사',
  author: '저자',
  translator: '옮긴이',
  publishedYear: '출판년도',
  isbn: 'ISBN',
} as const;

type MetadataFieldKey = keyof typeof fieldLabel;

const metadataFieldOrder: MetadataFieldKey[] = ['publisher', 'author', 'translator', 'publishedYear', 'isbn'];
const amazonConditionOptions: AmazonUsedConditionLevel[] = ['LIKE_NEW', 'VERY_GOOD', 'GOOD', 'ACCEPTABLE'];
const AMAZON_CONDITION_LABEL: Record<AmazonUsedConditionLevel, string> = {
  LIKE_NEW: 'Like New',
  VERY_GOOD: 'Very Good',
  GOOD: 'Good',
  ACCEPTABLE: 'Acceptable',
};

const mapLabelToFieldKey = (label: string): MetadataFieldKey | undefined => {
  const normalized = label.trim().toLowerCase();
  if (/(출판사|publisher)/.test(normalized)) return 'publisher';
  if (/(저자|작가|author)/.test(normalized)) return 'author';
  if (/(옮긴이|역자|번역|translator)/.test(normalized)) return 'translator';
  if (/(출판년도|출간년도|출간연도|연도|year)/.test(normalized)) return 'publishedYear';
  if (/isbn/.test(normalized)) return 'isbn';
  return undefined;
};

const fallbackValue = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : '스킵';
};

const splitOutsideParens = (input: string): string[] => {
  const tokens: string[] = [];
  let buffer = '';
  let depth = 0;

  for (const ch of input) {
    if (ch === '(' || ch === '[' || ch === '{') {
      depth += 1;
      buffer += ch;
      continue;
    }

    if (ch === ')' || ch === ']' || ch === '}') {
      depth = Math.max(0, depth - 1);
      buffer += ch;
      continue;
    }

    const separator = ch === ',' || ch === '，' || ch === '\n' || ch === ';';
    if (separator && depth === 0) {
      const token = buffer.trim();
      if (token) tokens.push(token);
      buffer = '';
      continue;
    }

    buffer += ch;
  }

  const last = buffer.trim();
  if (last) tokens.push(last);
  return tokens;
};

const cleanYear = (value: string): string | undefined => {
  const match4 = value.match(/(19|20)\d{2}/);
  if (match4) return match4[0];

  const match2 = value.match(/(^|[^0-9])(\d{2})\s*년?($|[^0-9])/);
  if (!match2) return undefined;

  const yy = Number(match2[2]);
  if (!Number.isFinite(yy)) return undefined;

  const currentYY = new Date().getFullYear() % 100;
  const normalizedYear = yy <= currentYY ? 2000 + yy : 1900 + yy;
  return String(normalizedYear);
};

const cleanIsbn = (value: string): string | undefined => {
  const normalized = value.replace(/[^0-9Xx]/g, '').toUpperCase();
  return normalized.length >= 10 ? normalized : undefined;
};

const normalizeMetadataValue = (field: MetadataFieldKey, rawValue: string): string => {
  const trimmed = rawValue.trim();
  if (!trimmed) return '스킵';
  if (field === 'publishedYear') return cleanYear(trimmed) ?? trimmed;
  if (field === 'isbn') return cleanIsbn(trimmed) ?? trimmed;
  return trimmed;
};

const assignUnknownTokens = (entry: Partial<BookEntry>, unknown: string[]) => {
  if (!unknown.length) return;

  if (unknown.length === 1) {
    if (!entry.author) entry.author = unknown[0];
    else if (!entry.publisher) entry.publisher = unknown[0];
    else if (!entry.translator) entry.translator = unknown[0];
    return;
  }

  const order: Array<keyof Pick<BookEntry, 'publisher' | 'author' | 'translator'>> = [
    'publisher',
    'author',
    'translator',
  ];

  unknown.forEach((value, idx) => {
    const target = order[idx];
    if (!target) return;
    if (!entry[target]) entry[target] = value;
  });
};

const parseBookEntry = (rawInput: string): Partial<BookEntry> => {
  const trimmed = rawInput.trim();
  if (!trimmed) return {};

  const match = trimmed.match(/^(.*?)(?:\((.*)\))?$/);
  const title = match?.[1]?.trim() ?? trimmed;
  const metaRaw = match?.[2]?.trim() ?? '';

  const entry: Partial<BookEntry> = {
    title,
  };

  if (!metaRaw) return entry;

  const tokens = splitOutsideParens(metaRaw)
    .map((token) => token.trim())
    .filter(Boolean);

  const unknownTokens: string[] = [];

  for (const token of tokens) {
    const keyValue = token.match(/^([^:：]+)[:：]\s*(.+)$/);
    if (keyValue) {
      const key = keyValue[1].trim().toLowerCase();
      const value = keyValue[2].trim();

      if (/(출판사|publisher)/.test(key)) {
        entry.publisher = value;
        continue;
      }
      if (/(저자|작가|author)/.test(key)) {
        entry.author = value;
        continue;
      }
      if (/(옮긴이|역자|번역|translator)/.test(key)) {
        entry.translator = value;
        continue;
      }
      if (/(출판년도|출간년도|출간연도|연도|year)/.test(key)) {
        entry.publishedYear = cleanYear(value) ?? value;
        continue;
      }
      if (/isbn/.test(key)) {
        entry.isbn = cleanIsbn(value) ?? value;
        continue;
      }
    }

    const year = cleanYear(token);
    if (year && !entry.publishedYear) {
      entry.publishedYear = year;
      continue;
    }

    const isbn = cleanIsbn(token);
    if (isbn && !entry.isbn) {
      entry.isbn = isbn;
      continue;
    }

    unknownTokens.push(token);
  }

  assignUnknownTokens(entry, unknownTokens);
  return entry;
};

const formatEntrySummary = (entry: BookEntry): string =>
  `${entry.title}(${fieldLabel.publisher}: ${fallbackValue(entry.publisher)}, ${fieldLabel.author}: ${fallbackValue(entry.author)}, ${fieldLabel.translator}: ${fallbackValue(entry.translator)}, ${fieldLabel.publishedYear}: ${fallbackValue(entry.publishedYear)}, ${fieldLabel.isbn}: ${fallbackValue(entry.isbn)})`;

const serializeEntry = (entry: BookEntry): string => formatEntrySummary(entry);

const parseInitialEntries = (queryInput: string): BookEntry[] =>
  splitOutsideParens(queryInput)
    .map((token, idx) => {
      const parsed = parseBookEntry(token);
      if (!parsed.title) return null;
      return {
        id: `entry_${idx}_${parsed.title}`,
        title: parsed.title,
        publisher: parsed.publisher,
        author: parsed.author,
        translator: parsed.translator,
        publishedYear: parsed.publishedYear,
        isbn: parsed.isbn,
      } as BookEntry;
    })
    .filter((entry): entry is BookEntry => Boolean(entry));

const parseSegmentToChip = (segment: string, fieldIndex: number): DraftMetadataChip | null => {
  const trimmed = segment.trim();
  if (!trimmed) return null;
  const fallbackField = metadataFieldOrder[Math.min(fieldIndex, metadataFieldOrder.length - 1)];
  const keyValue = trimmed.match(/^([^:：]+)\s*[:：]\s*(.*)$/);
  const field = keyValue ? mapLabelToFieldKey(keyValue[1]) ?? fallbackField : fallbackField;
  const rawValue = keyValue ? keyValue[2] : trimmed;
  const normalizedValue = normalizeMetadataValue(field, rawValue);
  return {
    field,
    label: fieldLabel[field],
    value: normalizedValue,
    isSkip: normalizedValue === '스킵',
  };
};

const parseDraftComposerState = (draftInput: string): DraftComposerState => {
  const openIdx = draftInput.indexOf('(');
  if (openIdx < 0) {
    return {
      active: false,
      title: draftInput,
      chips: [],
      currentField: undefined,
      currentValue: '',
    };
  }

  const title = draftInput.slice(0, openIdx);
  const closeIdx = draftInput.indexOf(')', openIdx + 1);
  const metaBody = draftInput.slice(openIdx + 1, closeIdx === -1 ? draftInput.length : closeIdx);
  const segments = metaBody.split(',');
  const trailingComma = /,\s*$/.test(metaBody);
  const committedCount = trailingComma ? segments.length : Math.max(0, segments.length - 1);
  const committedSegments = segments.slice(0, committedCount);
  const currentRawSegment = trailingComma ? '' : (segments[segments.length - 1] ?? '');

  const chips: DraftMetadataChip[] = committedSegments
    .map((segment, idx) => parseSegmentToChip(segment, idx))
    .filter((chip): chip is DraftMetadataChip => Boolean(chip));

  const currentField =
    chips.length < metadataFieldOrder.length ? metadataFieldOrder[chips.length] : undefined;
  const currentKeyValue = currentRawSegment.trim().match(/^([^:：]+)\s*[:：]\s*(.*)$/);
  const currentValue = currentKeyValue ? currentKeyValue[2].trim() : currentRawSegment.trim();

  return {
    active: true,
    title,
    chips,
    currentField,
    currentValue,
  };
};

const buildDraftFromComposerState = (state: DraftComposerState): string => {
  if (!state.active) return state.title;

  const chipSegments = state.chips.map((chip) => `${chip.label}: ${chip.value}`);
  const currentSegment =
    state.currentField !== undefined ? `${fieldLabel[state.currentField]}: ${state.currentValue}` : '';
  const allSegments = currentSegment ? [...chipSegments, currentSegment] : chipSegments;
  return `${state.title}(${allSegments.join(', ')}`;
};

export const SearchAndPreferences: React.FC<Props> = ({
  queryInput,
  setQueryInput,
  onSearch,
  isSearching,
  preferences,
  setPreferences,
}) => {
  const minQualityOptions: ConditionLevel[] = ['최상', '상', '중'];
  const [entries, setEntries] = useState<BookEntry[]>(() => parseInitialEntries(queryInput));
  const [draftInput, setDraftInput] = useState('');
  const draftInputRef = useRef<HTMLInputElement | null>(null);
  const editionMode: 'KOREAN_ONLY' | 'ORIGINAL_ONLY' | 'BOTH' = preferences.originalOnly
    ? 'ORIGINAL_ONLY'
    : preferences.includeOriginalEditions
      ? 'BOTH'
      : 'KOREAN_ONLY';
  const originalSourceMode = preferences.originalSourceMode;

  useEffect(() => {
    if (entries.length === 0 && queryInput.trim()) {
      setEntries(parseInitialEntries(queryInput));
    }
  }, [entries.length, queryInput]);

  const serializedQuery = useMemo(() => entries.map(serializeEntry).join('\n'), [entries]);

  useEffect(() => {
    if (queryInput !== serializedQuery) {
      setQueryInput(serializedQuery);
    }
  }, [queryInput, serializedQuery, setQueryInput]);

  const addDraftEntry = () => {
    const normalizedInput =
      draftInput.includes('(') && !draftInput.includes(')') ? `${draftInput})` : draftInput;
    const parsed = parseBookEntry(normalizedInput);
    if (!parsed.title) return;

    const nextEntry: BookEntry = {
      id: `entry_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: parsed.title,
      publisher: parsed.publisher,
      author: parsed.author,
      translator: parsed.translator,
      publishedYear: parsed.publishedYear,
      isbn: parsed.isbn,
    };

    setEntries((prev) => [...prev, nextEntry]);
    setDraftInput('');
  };

  const removeEntry = (id: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
  };

  const draftComposer = useMemo(() => parseDraftComposerState(draftInput), [draftInput]);
  const draftMetadataChips = draftComposer.chips;

  return (
    <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">책 검색 + 옵션 설정</h2>
          <p className="text-sm text-slate-500">아래 옵션으로 원하는 기준을 정하면, 여러 권을 한 번에 비교해 추천합니다.</p>
          <p className="mt-1 text-xs text-slate-500">
            책 제목 뒤 괄호 안에는 출판사, 저자, 옮긴이, 출판년도, ISBN을 자유롭게 넣을 수 있고 비운 항목은 자동으로 스킵됩니다.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            괄호 안에서 콤마(,)를 누르면 현재 항목이 확정되고 다음 항목으로 넘어가며, Enter를 누르면 현재 줄이 확정됩니다.
          </p>
        </div>
        <button
          onClick={onSearch}
          disabled={isSearching || !serializedQuery.trim()}
          className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isSearching ? '찾는 중...' : '추천 받기'}
        </button>
      </div>

      <div className="mb-4 overflow-hidden rounded-xl border border-slate-200">
        <div className="grid grid-cols-[70px_1fr] border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
          <div className="px-3 py-2">번호</div>
          <div className="px-3 py-2">책 정보</div>
        </div>

        {entries.map((entry, idx) => (
          <div key={entry.id} className="grid grid-cols-[70px_1fr] border-b border-slate-100 last:border-b-0">
            <div className="grid place-items-center bg-slate-100 px-3 py-3 text-sm font-bold text-slate-700">{idx + 1}</div>
            <div className="flex items-center justify-between gap-3 bg-slate-100 px-3 py-3">
              <div className="text-sm text-slate-800">{formatEntrySummary(entry)}</div>
              <button
                type="button"
                onClick={() => removeEntry(entry.id)}
                className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                삭제
              </button>
            </div>
          </div>
        ))}

        <div className="grid grid-cols-[70px_1fr] bg-emerald-50/60">
          <div className="grid place-items-center border-r border-emerald-100 px-3 py-3 text-sm font-bold text-emerald-700">
            {entries.length + 1}
          </div>
          <div className="border-l-4 border-emerald-400 px-3 py-3">
            {!draftComposer.active ? (
              <input
                ref={draftInputRef}
                value={draftInput}
                onChange={(e) => {
                  setDraftInput(e.target.value);
                }}
                onKeyDown={(e) => {
                  if ((e.key === '(' || e.key === '（') && !draftInput.includes('(')) {
                    e.preventDefault();
                    const input = e.currentTarget;
                    const start = input.selectionStart ?? input.value.length;
                    const end = input.selectionEnd ?? input.value.length;
                    const insertion = '(';
                    const nextValue = `${input.value.slice(0, start)}${insertion}${input.value.slice(end)}`;
                    setDraftInput(nextValue);
                    requestAnimationFrame(() => {
                      draftInputRef.current?.focus();
                    });
                    return;
                  }
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addDraftEntry();
                  }
                }}
                placeholder="예) 우리의 뇌는 어떻게 배우는가(스타니슬라스 드앤, 웅진지식하우스, 2021, ISBN 9788901259973)"
                className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-[15px] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            ) : (
              <div
                className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-[15px] focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100"
                onClick={() => draftInputRef.current?.focus()}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-slate-900">{draftComposer.title}(</span>
                  {draftMetadataChips.map((chip, idx) => (
                    <span
                      key={`${chip.field}-${idx}-${chip.value}`}
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        chip.isSkip
                          ? 'border-slate-200 bg-slate-100 text-slate-600'
                          : 'border-emerald-200 bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {chip.label}: {chip.value}
                    </span>
                  ))}
                  {draftComposer.currentField && <span className="text-slate-400">{fieldLabel[draftComposer.currentField]}:</span>}
                  <input
                    ref={draftInputRef}
                    value={draftComposer.currentValue}
                    onChange={(e) => {
                      const nextState: DraftComposerState = {
                        ...draftComposer,
                        currentValue: e.target.value,
                      };
                      setDraftInput(buildDraftFromComposerState(nextState));
                    }}
                    onKeyDown={(e) => {
                      if ((e.key === ',' || e.key === '，') && draftComposer.currentField) {
                        e.preventDefault();
                        const normalized = normalizeMetadataValue(draftComposer.currentField, draftComposer.currentValue);
                        const committedChip: DraftMetadataChip = {
                          field: draftComposer.currentField,
                          label: fieldLabel[draftComposer.currentField],
                          value: normalized,
                          isSkip: normalized === '스킵',
                        };
                        const nextChips = [...draftComposer.chips, committedChip];
                        const nextField =
                          nextChips.length < metadataFieldOrder.length ? metadataFieldOrder[nextChips.length] : undefined;
                        const nextState: DraftComposerState = {
                          active: true,
                          title: draftComposer.title,
                          chips: nextChips,
                          currentField: nextField,
                          currentValue: '',
                        };
                        setDraftInput(buildDraftFromComposerState(nextState));
                        return;
                      }

                      if (e.key === 'Backspace' && !draftComposer.currentValue && draftComposer.chips.length > 0) {
                        e.preventDefault();
                        const previous = draftComposer.chips[draftComposer.chips.length - 1];
                        const nextChips = draftComposer.chips.slice(0, -1);
                        const nextState: DraftComposerState = {
                          active: true,
                          title: draftComposer.title,
                          chips: nextChips,
                          currentField: previous.field,
                          currentValue: previous.isSkip ? '' : previous.value,
                        };
                        setDraftInput(buildDraftFromComposerState(nextState));
                        return;
                      }

                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addDraftEntry();
                      }
                    }}
                    className="min-w-[120px] flex-1 border-none bg-transparent px-1 py-0.5 text-[15px] text-slate-800 outline-none"
                    placeholder={draftComposer.currentField ? '값 입력' : ''}
                  />
                  <span className="text-slate-400">)</span>
                </div>
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>콤마(,)를 누르면 현재 항목이 확정되고 다음 항목으로 이동합니다. 비워둔 채 콤마를 누르면 스킵으로 처리됩니다.</span>
              <span>Enter를 누르면 이 줄이 확정되고 다음 번호 줄이 자동 생성됩니다.</span>
              <button
                type="button"
                onClick={addDraftEntry}
                className="rounded-md border border-emerald-300 bg-emerald-100 px-2 py-1 font-semibold text-emerald-800 hover:bg-emerald-200"
              >
                이 줄 확정
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4 text-xs text-slate-500">현재 {entries.length}권 입력됨</div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-700">자동 비교 안내</h3>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <p>최적화 우선순위는 직접 고르지 않아도 됩니다.</p>
            <p className="mt-1 text-xs text-slate-600">결과 화면에서 가격/품질/배송/균형 4가지 방식으로 한꺼번에 비교해 보여줍니다.</p>
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-700">꼭 지킬 조건</h3>

          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">최소 중고책 품질 상태</p>
            <div className="space-y-2">
              <div className="rounded-lg border border-slate-200 p-2.5">
                <p className="mb-2 text-xs font-semibold text-slate-500">알라딘</p>
                <div className="flex flex-wrap gap-2">
                  {minQualityOptions.map((condition) => (
                    <button
                      key={`aladin-min-${condition}`}
                      type="button"
                      onClick={() =>
                        setPreferences((prev) => ({
                          ...prev,
                          minCondition: condition,
                          minOriginalUsedConditionAladin: condition,
                        }))
                      }
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        preferences.minOriginalUsedConditionAladin === condition
                          ? 'border-amber-600 bg-amber-500 text-white'
                          : 'border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-400'
                      }`}
                    >
                      {CONDITION_DISPLAY_LABEL[condition]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-2.5">
                <p className="mb-2 text-xs font-semibold text-slate-500">아마존</p>
                <div className="flex flex-wrap gap-2">
                  {amazonConditionOptions.map((condition) => (
                    <button
                      key={`amazon-min-${condition}`}
                      type="button"
                      onClick={() =>
                        setPreferences((prev) => ({
                          ...prev,
                          minOriginalUsedConditionAmazon: condition,
                        }))
                      }
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        preferences.minOriginalUsedConditionAmazon === condition
                          ? 'border-amber-600 bg-amber-500 text-white'
                          : 'border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-400'
                      }`}
                    >
                      {AMAZON_CONDITION_LABEL[condition]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm">
              <input
                type="checkbox"
                checked={preferences.strictCondition}
                onChange={(e) => setPreferences((prev) => ({ ...prev, strictCondition: e.target.checked }))}
              />
              조건 엄격히 지키기
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm">
              <input
                type="checkbox"
                checked={preferences.includeUsed}
                onChange={(e) => setPreferences((prev) => ({ ...prev, includeUsed: e.target.checked }))}
              />
              중고 포함
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm">
              <input
                type="checkbox"
                checked={preferences.includeNew}
                onChange={(e) => setPreferences((prev) => ({ ...prev, includeNew: e.target.checked }))}
              />
              국문 새책도 포함
            </label>
            <div className="rounded-lg border border-slate-200 p-3 text-sm sm:col-span-2">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">원서/국문 검색 모드 (하나만 선택)</p>
              <div className="grid gap-2">
                <label className="flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5">
                  <input
                    type="radio"
                    name="edition-mode"
                    checked={editionMode === 'KOREAN_ONLY'}
                    onChange={() =>
                      setPreferences((prev) => ({
                        ...prev,
                        includeOriginalEditions: false,
                        originalOnly: false,
                      }))
                    }
                  />
                  한국어 번역본만
                </label>
                <label className="flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5">
                  <input
                    type="radio"
                    name="edition-mode"
                    checked={editionMode === 'ORIGINAL_ONLY'}
                    onChange={() =>
                      setPreferences((prev) => ({
                        ...prev,
                        includeOriginalEditions: true,
                        originalOnly: true,
                      }))
                    }
                  />
                  원서만
                </label>
                <label className="flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5">
                  <input
                    type="radio"
                    name="edition-mode"
                    checked={editionMode === 'BOTH'}
                    onChange={() =>
                      setPreferences((prev) => ({
                        ...prev,
                        includeOriginalEditions: true,
                        originalOnly: false,
                      }))
                    }
                  />
                  국문 + 원서 함께 구매
                </label>
              </div>
            </div>
            {preferences.includeOriginalEditions && (
              <div className="rounded-lg border border-slate-200 p-3 text-sm sm:col-span-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">원서 판매처 선택 (하나만 선택)</p>
                <div className="grid gap-2">
                  <label className="flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5">
                    <input
                      type="radio"
                      name="original-source-mode"
                      checked={originalSourceMode === 'ALADIN_ONLY'}
                      onChange={() =>
                        setPreferences((prev) => ({
                          ...prev,
                          originalSourceMode: 'ALADIN_ONLY',
                        }))
                      }
                    />
                    알라딘 원서만
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5">
                    <input
                      type="radio"
                      name="original-source-mode"
                      checked={originalSourceMode === 'AMAZON_ONLY'}
                      onChange={() =>
                        setPreferences((prev) => ({
                          ...prev,
                          originalSourceMode: 'AMAZON_ONLY',
                        }))
                      }
                    />
                    아마존 원서만
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5">
                    <input
                      type="radio"
                      name="original-source-mode"
                      checked={originalSourceMode === 'BOTH'}
                      onChange={() =>
                        setPreferences((prev) => ({
                          ...prev,
                          originalSourceMode: 'BOTH',
                        }))
                      }
                    />
                    알라딘 + 아마존 원서
                  </label>
                </div>
              </div>
            )}
            {preferences.includeOriginalEditions && (
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={preferences.includeOriginalNew}
                  onChange={(e) =>
                    setPreferences((prev) => ({
                      ...prev,
                      includeOriginalNew: e.target.checked,
                    }))
                  }
                />
                원서 새책도 포함 (끄면 원서 중고만)
              </label>
            )}
          </div>

          <div className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">최대 총액(선택)</span>
              <input
                type="number"
                min={0}
                value={preferences.maxTotalPrice ?? ''}
                onChange={(e) =>
                  setPreferences((prev) => ({
                    ...prev,
                    maxTotalPrice: e.target.value === '' ? null : Number(e.target.value),
                  }))
                }
                placeholder="예: 20000"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-600"
              />
              {preferences.maxTotalPrice !== null && (
                <span className="mt-1 block text-xs text-slate-500">지금 설정한 최대금액: {formatCurrency(preferences.maxTotalPrice)}</span>
              )}
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">최대 배송일(선택)</span>
              <input
                type="number"
                min={1}
                value={preferences.maxShippingDays ?? ''}
                onChange={(e) =>
                  setPreferences((prev) => ({
                    ...prev,
                    maxShippingDays: e.target.value === '' ? null : Number(e.target.value),
                  }))
                }
                placeholder="예: 4"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-600"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                상태를 낮춰도 되는 최소 절약금액 (원)
              </span>
              <input
                type="number"
                min={0}
                value={preferences.downgradeSavingsThreshold}
                onChange={(e) =>
                  setPreferences((prev) => ({
                    ...prev,
                    downgradeSavingsThreshold: Number(e.target.value) || 0,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-teal-600"
              />
            </label>
          </div>
        </div>
      </div>
    </section>
  );
};
