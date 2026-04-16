'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ASSESSMENT_SECTIONS } from '@/lib/funnel/questions';
import type { AssessmentAnswers } from '@/lib/funnel/types';
import type { Question } from '@/lib/funnel/questions';

// ---------------------------------------------------------
// Progress bar
// ---------------------------------------------------------
function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.round(((current + 1) / total) * 100);
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-gray-400 mb-1.5">
        <span>
          Step {current + 1} of {total}
        </span>
        <span>{pct}% complete</span>
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-500 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// Single question renderers
// ---------------------------------------------------------
function SingleSelect({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      {question.options?.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
            value === opt.value
              ? 'border-amber-500 bg-amber-50 text-gray-900'
              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          <span className="font-medium">{opt.label}</span>
          {opt.description && (
            <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
          )}
        </button>
      ))}
    </div>
  );
}

function MultiSelect({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(v: string) {
    if (value.includes(v)) {
      onChange(value.filter((x) => x !== v));
    } else {
      onChange([...value, v]);
    }
  }

  return (
    <div className="space-y-2">
      {question.options?.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => toggle(opt.value)}
          className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
            value.includes(opt.value)
              ? 'border-amber-500 bg-amber-50 text-gray-900'
              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                value.includes(opt.value)
                  ? 'bg-amber-500 border-amber-500'
                  : 'border-gray-300'
              }`}
            >
              {value.includes(opt.value) && (
                <span className="text-white text-xs font-bold">✓</span>
              )}
            </div>
            <span className="font-medium">{opt.label}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function BooleanSelect({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: boolean | undefined;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex gap-3">
      {[
        { label: 'Yes', val: true },
        { label: 'No', val: false },
      ].map(({ label, val }) => (
        <button
          key={label}
          type="button"
          onClick={() => onChange(val)}
          className={`flex-1 py-3 rounded-xl border font-semibold transition-all ${
            value === val
              ? 'border-amber-500 bg-amber-50 text-amber-700'
              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function TextInput({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type={question.type === 'email' ? 'email' : 'text'}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={question.placeholder}
      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100 text-gray-900 bg-white"
    />
  );
}

// ---------------------------------------------------------
// Question renderer dispatcher
// ---------------------------------------------------------
function QuestionField({
  question,
  answers,
  onAnswer,
}: {
  question: Question;
  answers: Partial<AssessmentAnswers>;
  onAnswer: (key: string, value: unknown) => void;
}) {
  const key = question.key as keyof AssessmentAnswers;
  const raw = answers[key];

  switch (question.type) {
    case 'single_select':
      return (
        <SingleSelect
          question={question}
          value={raw as string | undefined}
          onChange={(v) => onAnswer(question.key, v)}
        />
      );
    case 'multi_select':
      return (
        <MultiSelect
          question={question}
          value={(raw as string[] | undefined) ?? []}
          onChange={(v) => onAnswer(question.key, v)}
        />
      );
    case 'boolean':
      return (
        <BooleanSelect
          question={question}
          value={raw as boolean | undefined}
          onChange={(v) => onAnswer(question.key, v)}
        />
      );
    case 'text':
    case 'email':
      return (
        <TextInput
          question={question}
          value={raw as string | undefined}
          onChange={(v) => onAnswer(question.key, v)}
        />
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------
// Section step view
// ---------------------------------------------------------
function SectionStep({
  section,
  answers,
  onAnswer,
}: {
  section: (typeof ASSESSMENT_SECTIONS)[number];
  answers: Partial<AssessmentAnswers>;
  onAnswer: (key: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-8">
      {section.questions.map((q) => (
        <div key={q.key}>
          <label className="block text-gray-900 font-semibold mb-1 leading-snug">
            {q.label}
            {q.required && <span className="text-amber-500 ml-1">*</span>}
          </label>
          {q.description && (
            <p className="text-gray-500 text-sm mb-3 leading-relaxed">{q.description}</p>
          )}
          <QuestionField question={q} answers={answers} onAnswer={onAnswer} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------
// Submission spinner
// ---------------------------------------------------------
function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-6">
      <div className="w-12 h-12 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin" />
      <div className="text-center">
        <p className="font-semibold text-gray-800 text-lg">Analysing your profile…</p>
        <p className="text-gray-500 text-sm mt-1">
          Scoring your responses against our race database.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// Main page
// ---------------------------------------------------------
export default function AssessPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<AssessmentAnswers>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalSteps = ASSESSMENT_SECTIONS.length;
  const section = ASSESSMENT_SECTIONS[currentStep];

  const onAnswer = useCallback((key: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Validate required fields in current section
  function canProceed(): boolean {
    for (const q of section.questions) {
      if (!q.required) continue;
      const val = answers[q.key as keyof AssessmentAnswers];
      if (val === undefined || val === null || val === '') return false;
    }
    return true;
  }

  function handleNext() {
    if (currentStep < totalSteps - 1) {
      setCurrentStep((s) => s + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      handleSubmit();
    }
  }

  function handleBack() {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    try {
      // Extract UTM params from URL if present
      const params = new URLSearchParams(window.location.search);

      const res = await fetch('/api/funnel/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers,
          utm_source: params.get('utm_source') ?? undefined,
          utm_medium: params.get('utm_medium') ?? undefined,
          utm_campaign: params.get('utm_campaign') ?? undefined,
          utm_content: params.get('utm_content') ?? undefined,
          utm_term: params.get('utm_term') ?? undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }

      // Store results in sessionStorage so results page can access them without re-fetching
      sessionStorage.setItem(
        `funnel_result_${data.assessment_id}`,
        JSON.stringify(data.result)
      );

      router.push(`/funnel/feeder-race-finder/results/${data.assessment_id}`);
    } catch {
      setError('A network error occurred. Please check your connection and try again.');
      setSubmitting(false);
    }
  }

  if (submitting) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <div className="flex-1 max-w-xl mx-auto w-full px-6 py-12">
          <Spinner />
        </div>
      </div>
    );
  }

  const isLastStep = currentStep === totalSteps - 1;

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Header */}
      <header className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-xl mx-auto">
          <p className="text-sm font-semibold text-gray-400 mb-3">
            Feeder Race Finder · Marathon des Sables
          </p>
          <ProgressBar current={currentStep} total={totalSteps} />
        </div>
      </header>

      {/* Content */}
      <main className="max-w-xl mx-auto px-6 py-10">
        {/* Section header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{section.title}</h1>
          <p className="text-gray-500 leading-relaxed">{section.subtitle}</p>
        </div>

        {/* Questions */}
        <SectionStep section={section} answers={answers} onAnswer={onAnswer} />

        {/* Error */}
        {error && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Navigation */}
        <div className="mt-10 flex items-center gap-4">
          {currentStep > 0 && (
            <button
              type="button"
              onClick={handleBack}
              className="px-5 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
            >
              ← Back
            </button>
          )}
          <button
            type="button"
            onClick={handleNext}
            disabled={!canProceed()}
            className={`flex-1 py-3 rounded-xl font-bold text-white transition-colors ${
              canProceed()
                ? 'bg-amber-500 hover:bg-amber-600'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isLastStep ? 'Get my recommendation →' : 'Continue →'}
          </button>
        </div>

        {/* Required field hint */}
        {section.questions.some((q) => q.required) && (
          <p className="mt-4 text-xs text-gray-400 text-center">
            Fields marked <span className="text-amber-500">*</span> are required to continue.
          </p>
        )}
      </main>
    </div>
  );
}
