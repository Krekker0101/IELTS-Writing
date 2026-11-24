import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Layers,
  Loader2,
  RotateCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { VocabularyFlashcard } from '../types/ielts';
import { useAIStatus } from '../contexts/AIStatusContext';

interface VocabularyFlashcardsProps {
  flashcards: VocabularyFlashcard[];
  hasSourceErrors: boolean;
  onFlashcardsUpdated: (flashcards: VocabularyFlashcard[]) => void;
}

type DeckFilter = 'all' | 'to-review' | 'mastered' | 'writing' | 'speaking';

export const VocabularyFlashcards: React.FC<VocabularyFlashcardsProps> = ({
  flashcards,
  hasSourceErrors,
  onFlashcardsUpdated,
}) => {
  const { beginProcessing, endProcessing } = useAIStatus();
  const [filter, setFilter] = useState<DeckFilter>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busyCardId, setBusyCardId] = useState<string | null>(null);

  const filteredDeck = useMemo(() => {
    switch (filter) {
      case 'to-review':
        return flashcards.filter((c) => !c.mastered);
      case 'mastered':
        return flashcards.filter((c) => c.mastered);
      case 'writing':
        return flashcards.filter((c) => c.sourceModule === 'writing');
      case 'speaking':
        return flashcards.filter((c) => c.sourceModule === 'speaking');
      default:
        return flashcards;
    }
  }, [flashcards, filter]);

  const safeIndex =
    filteredDeck.length === 0 ? 0 : Math.min(activeIndex, filteredDeck.length - 1);
  const currentCard = filteredDeck[safeIndex] ?? null;
  const masteredCount = flashcards.filter((c) => c.mastered).length;

  const handleFilterChange = (nextFilter: DeckFilter) => {
    setFilter(nextFilter);
    setActiveIndex(0);
    setIsFlipped(false);
  };

  const goPrev = () => {
    if (filteredDeck.length <= 1) return;
    setIsFlipped(false);
    setActiveIndex((prev) => (prev - 1 + filteredDeck.length) % filteredDeck.length);
  };

  const goNext = () => {
    if (filteredDeck.length <= 1) return;
    setIsFlipped(false);
    setActiveIndex((prev) => (prev + 1) % filteredDeck.length);
  };

  const handleGenerateFlashcards = async () => {
    setErrorMsg(null);
    setIsGenerating(true);
    beginProcessing('Генерация словарных карточек');
    try {
      const res = await fetch('/api/flashcards/generate', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось сгенерировать карточки.');
      }
      onFlashcardsUpdated(data.flashcards as VocabularyFlashcard[]);
      setFilter('all');
      setActiveIndex(0);
      setIsFlipped(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка генерации карточек.');
    } finally {
      setIsGenerating(false);
      endProcessing();
    }
  };

  const handleToggleMastered = async (card: VocabularyFlashcard) => {
    setBusyCardId(card.id);
    try {
      const res = await fetch(`/api/flashcards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mastered: !card.mastered }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.flashcards)) {
        onFlashcardsUpdated(data.flashcards as VocabularyFlashcard[]);
        if (!card.mastered && filteredDeck.length > 1) {
          // Gently advance after marking mastered
          setIsFlipped(false);
          setActiveIndex((prev) => (prev + 1) % filteredDeck.length);
        }
      }
    } catch {
      // ignore
    } finally {
      setBusyCardId(null);
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    setBusyCardId(cardId);
    try {
      const res = await fetch(`/api/flashcards/${cardId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && Array.isArray(data.flashcards)) {
        onFlashcardsUpdated(data.flashcards as VocabularyFlashcard[]);
        setIsFlipped(false);
        setActiveIndex((prev) => Math.max(0, prev - 1));
      }
    } catch {
      // ignore
    } finally {
      setBusyCardId(null);
    }
  };

  return (
    <section className="space-y-4">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Карточки лексики по вашим ошибкам (Flashcards)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            ИИ собирает точные выражения уровня Band 7.5–8.5 на основе ошибок из ваших прошлых работ Writing и Speaking.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {flashcards.length > 0 && (
            <span className="text-xs font-mono tabular-nums text-slate-600">
              Изучено {masteredCount}/{flashcards.length}
            </span>
          )}
          <button
            type="button"
            onClick={handleGenerateFlashcards}
            disabled={isGenerating || !hasSourceErrors}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#FF4B3A] rounded-xl hover:bg-[#e84232] disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0 transition-colors"
          >
            {isGenerating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Создать карточки из ошибок
          </button>
        </div>
      </div>

      {errorMsg && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {errorMsg}
        </p>
      )}

      {/* Filter Bar */}
      {flashcards.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl">
            {(
              [
                { id: 'all', label: `Все (${flashcards.length})` },
                { id: 'to-review', label: `Повторить (${flashcards.length - masteredCount})` },
                { id: 'mastered', label: `Изучено (${masteredCount})` },
                { id: 'writing', label: 'Writing' },
                { id: 'speaking', label: 'Speaking' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleFilterChange(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap cursor-pointer transition-colors ${
                  filter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {filteredDeck.length > 0 && (
            <span className="text-xs font-mono tabular-nums text-slate-500">
              Карточка {safeIndex + 1} из {filteredDeck.length}
            </span>
          )}
        </div>
      )}

      {/* Empty State vs Interactive Flip Card */}
      {flashcards.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-2">
          <Layers className="w-7 h-7 text-slate-400 mx-auto" />
          <p className="text-sm font-medium text-slate-800">
            Словарных карточек пока нет
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {hasSourceErrors
              ? 'Нажмите «Создать карточки из ошибок», чтобы ИИ превратил ваши неточности из Writing и Speaking в интерактивные карточки повторения.'
              : 'Отправьте хотя бы одно эссе Writing или пройдите Speaking-сессию, чтобы здесь появились персональные карточки.'}
          </p>
        </div>
      ) : filteredDeck.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
          В выбранном фильтре пока нет карточек.
        </div>
      ) : (
        currentCard && (
          <div className="space-y-5">
            {/* Simple Interactive Flip-Card UI */}
            <div className="flip-card-scene max-w-2xl mx-auto">
              <div
                role="button"
                tabIndex={0}
                onClick={() => setIsFlipped((f) => !f)}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    setIsFlipped((f) => !f);
                  } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    goPrev();
                  } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    goNext();
                  }
                }}
                aria-label={`Карточка ${currentCard.term}. Нажмите, чтобы перевернуть`}
                className={`flip-card-inner min-h-[270px] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4B3A] rounded-3xl ${
                  isFlipped ? 'is-flipped' : ''
                }`}
              >
                {/* FRONT FACE */}
                <div className="flip-card-face hero-pastel-mesh border border-slate-200 rounded-3xl p-6 sm:p-8 min-h-[270px] flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
                    <span>
                      {currentCard.sourceModule === 'speaking' ? 'Speaking' : 'Writing'} ·{' '}
                      {currentCard.sourceCategory}
                    </span>
                    <span
                      className={`font-semibold ${
                        currentCard.mastered ? 'text-emerald-700' : 'text-slate-500'
                      }`}
                    >
                      {currentCard.mastered ? 'Изучено' : 'На повторении'}
                    </span>
                  </div>

                  <div className="py-4 text-center space-y-3">
                    <p className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight text-balance">
                      {currentCard.term}
                    </p>
                    {currentCard.originalMistake && (
                      <p className="text-xs text-slate-600">
                        Вместо ошибки:{' '}
                        <span className="line-through text-red-700 font-medium">
                          {currentCard.originalMistake}
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-slate-500">
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>Нажмите на карточку, чтобы увидеть значение и пример</span>
                  </div>
                </div>

                {/* BACK FACE */}
                <div className="flip-card-face flip-card-face-back absolute inset-0 bg-slate-900 text-white border border-slate-800 rounded-3xl p-6 sm:p-8 min-h-[270px] flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
                    <span className="font-semibold text-white">{currentCard.term}</span>
                    <span className="font-mono tabular-nums">
                      Повторений: {currentCard.reviewCount}
                    </span>
                  </div>

                  <div className="space-y-3 my-auto py-2">
                    <div>
                      <p className="text-[11px] font-semibold text-slate-400">
                        Значение и перевод
                      </p>
                      <p className="text-base font-bold text-white mt-0.5">
                        {currentCard.translationOrMeaning}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-white/10">
                      <p className="text-[11px] font-semibold text-slate-400">
                        Пример уровня Band 8
                      </p>
                      <p className="text-sm text-emerald-200 mt-0.5 leading-relaxed">
                        «{currentCard.exampleSentence}»
                      </p>
                    </div>

                    <div className="pt-2 border-t border-white/10">
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {currentCard.correctionTip}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>Нажмите, чтобы вернуть лицевую сторону</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Deck Controls */}
            <div className="max-w-2xl mx-auto flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={filteredDeck.length <= 1}
                  className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Назад
                </button>
                <button
                  type="button"
                  onClick={() => setIsFlipped((f) => !f)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  Перевернуть
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={filteredDeck.length <= 1}
                  className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                >
                  Вперёд
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busyCardId === currentCard.id}
                  onClick={() => handleToggleMastered(currentCard)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
                    currentCard.mastered
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {currentCard.mastered ? 'Вернуть в повторение' : 'Знаю это слово'}
                </button>

                <button
                  type="button"
                  disabled={busyCardId === currentCard.id}
                  onClick={() => handleDeleteCard(currentCard.id)}
                  className="p-2 text-slate-400 hover:text-red-600 bg-white border border-slate-200 rounded-xl hover:border-red-200 cursor-pointer"
                  aria-label="Удалить карточку"
                  title="Удалить карточку"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Stored Cards Quick Index */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
              {filteredDeck.map((card, idx) => {
                const isActive = idx === safeIndex;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => {
                      setActiveIndex(idx);
                      setIsFlipped(false);
                    }}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                      isActive
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">{card.term}</p>
                      <p
                        className={`text-[11px] truncate ${
                          isActive ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        {card.sourceModule === 'speaking' ? 'Speaking' : 'Writing'} ·{' '}
                        {card.translationOrMeaning}
                      </p>
                    </div>
                    {card.mastered && (
                      <CheckCircle2
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-emerald-400' : 'text-emerald-600'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )
      )}
    </section>
  );
};
