"use client";

import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { OnboardingConfig, OnboardingStep, UserOnboardingRow } from "@/lib/onboarding/types";
import { markStepComplete, dismissTour } from "@/lib/actions/onboarding";

interface OnboardingContextType {
  isAvailable: boolean;
  isTourActive: boolean;
  startTour: () => void;
  skipTour: () => void;
  hasSeenTour: boolean;
  newStepsAvailable: boolean;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  return context || { isAvailable: false, isTourActive: false, startTour: () => {}, skipTour: () => {}, hasSeenTour: false, newStepsAvailable: false };
}

interface OnboardingProviderProps {
  children: React.ReactNode;
  initialState: UserOnboardingRow | null;
  config: OnboardingConfig;
  role: "coach" | "athlete";
}

export default function OnboardingProvider({
  children,
  initialState,
  config,
  role,
}: OnboardingProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isTourActive, setIsTourActive] = useState(false);
  const [completedStepIds, setCompletedStepIds] = useState<string[]>(
    initialState?.completed_step_ids || []
  );
  const [hasSeenTour, setHasSeenTour] = useState(
    initialState?.has_seen_tour || false
  );
  const [tourVersion, setTourVersion] = useState(
    initialState?.tour_version || 0
  );
  const [driverInstance, setDriverInstance] = useState<any>(null);
  const [newStepsAvailable, setNewStepsAvailable] = useState(false);
  const stepsToShowRef = useRef<OnboardingStep[]>([]);

  // Calculate which steps are new (not yet completed)
  const incompleteSteps = config.steps.filter(
    (step) => !completedStepIds.includes(step.id)
  );

  // Check if there are new features available
  useEffect(() => {
    if (hasSeenTour && tourVersion < config.currentVersion && incompleteSteps.length > 0) {
      setNewStepsAvailable(true);
    }
  }, [hasSeenTour, tourVersion, config.currentVersion, incompleteSteps.length]);

  // Auto-start tour for first-time users
  useEffect(() => {
    if (!hasSeenTour && !isTourActive && incompleteSteps.length > 0) {
      // Delay to let page content paint first
      const timer = setTimeout(() => {
        startTour();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleStepComplete = async (stepId: string) => {
    setCompletedStepIds((prev) => {
      const updated = Array.from(new Set([...prev, stepId]));
      markStepComplete(stepId);
      return updated;
    });
  };

  const handleTourComplete = async () => {
    setIsTourActive(false);
    setHasSeenTour(true);
    setTourVersion(config.currentVersion);
    setNewStepsAvailable(false);
    await dismissTour(config.currentVersion);
  };

  const startTour = async () => {
    // Filter steps to only incomplete ones
    const stepsToShow = incompleteSteps;
    stepsToShowRef.current = stepsToShow;

    if (stepsToShow.length === 0) return;

    const driverInst = driver({
      showProgress: true,
      steps: stepsToShow.map((step, index) => {
        const currentRoute = step.route;

        const driverStep: any = {
          popover: {
            title: step.title,
            description: step.description,
            side: step.position as any,
          },
        };

        // Only include element if selector is not null
        if (step.selector) {
          driverStep.element = step.selector;
        }

        return driverStep;
      }),
      onDestroyed: () => {
        handleTourComplete();
      },
    });

    setDriverInstance(driverInst);
    setIsTourActive(true);

    // Track step changes and handle navigation
    const observer = setInterval(async () => {
      if (!driverInst) {
        clearInterval(observer);
        return;
      }

      const activeIndex = driverInst.getActiveIndex();
      const activeStep = stepsToShow[activeIndex];

      if (activeStep && activeStep.route && !pathname.startsWith(activeStep.route)) {
        router.push(activeStep.route);
      }

      // Mark current step as complete when we move to next
      if (activeIndex > 0 && activeIndex < stepsToShow.length) {
        const prevStep = stepsToShow[activeIndex - 1];
        if (!completedStepIds.includes(prevStep.id)) {
          await handleStepComplete(prevStep.id);
        }
      }
    }, 100);

    driverInst.drive();

    return () => clearInterval(observer);
  };

  const skipTour = async () => {
    if (driverInstance) {
      driverInstance.destroy();
    }
    await handleTourComplete();
  };

  return (
    <OnboardingContext.Provider
      value={{
        isAvailable: true,
        isTourActive,
        startTour,
        skipTour,
        hasSeenTour,
        newStepsAvailable,
      }}
    >
      {/* Show "new features available" banner if needed */}
      {newStepsAvailable && (
        <div
          style={{
            position: "fixed",
            top: "64px",
            left: "240px",
            right: 0,
            background: "linear-gradient(to right, var(--brand-50), var(--brand-25))",
            borderBottom: "1px solid var(--brand-200)",
            padding: "12px 24px",
            zIndex: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: "13px", color: "var(--slate-700)", fontWeight: 500 }}>
            {incompleteSteps.length} new {incompleteSteps.length === 1 ? "feature" : "features"} added. Take a quick tour?
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={startTour}
              style={{
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: 600,
                background: "var(--brand-600)",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              Show me
            </button>
            <button
              onClick={skipTour}
              style={{
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: 500,
                background: "white",
                color: "var(--slate-700)",
                border: "1px solid var(--brand-200)",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {children}
    </OnboardingContext.Provider>
  );
}
