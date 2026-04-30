"use client";

import { useState } from "react";
import { useTutorial } from "@/lib/context/TutorialContext";

interface TutorialInfoBoxProps {
  title: string;
  description: string;
  step?: number;
  totalSteps?: number;
  onNext?: () => void;
  showNext?: boolean;
}

export default function TutorialInfoBox({
  title,
  description,
  step,
  totalSteps,
  onNext,
  showNext = true,
}: TutorialInfoBoxProps) {
  const { isInTutorial } = useTutorial();
  const [dismissed, setDismissed] = useState(false);

  if (!isInTutorial || dismissed) {
    return null;
  }

  return (
    <div className="mb-6 rounded-xl border-2 border-blue-300 bg-blue-50 p-4">
      <div className="flex gap-3">
        <div className="flex-shrink-0 pt-0.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
            i
          </div>
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-blue-900">{title}</h3>
          <p className="mt-1 text-sm text-blue-800">{description}</p>
          <div className="mt-3 flex items-center justify-between">
            {step && totalSteps && (
              <span className="text-xs font-medium text-blue-700">
                Step {step} of {totalSteps}
              </span>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setDismissed(true)}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                Dismiss
              </button>
              {showNext && onNext && (
                <button
                  onClick={onNext}
                  className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Next →
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
