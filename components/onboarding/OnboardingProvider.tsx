"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
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

    if (stepsToShow.length === 0) return;

    const driverInst = driver({
      showProgress: true,
      steps: stepsToShow.map((step) => {
        const currentRoute = step.route;
        const isCurrentRoute = !currentRoute || pathname.startsWith(currentRoute);

        const driverStep: any = {
          popover: {
            title: step.title,
            description: step.description,
            side: step.position as any,
          },
          onHighlighted: async () => {
            // Navigate to this step's route if needed
            if (!isCurrentRoute && currentRoute) {
              await new Promise<void>((resolve) => {
                router.push(currentRoute);
                // Wait for DOM to settle after navigation
                setTimeout(resolve, 500);
              });
            }
          },
        };

        // Only include element if selector is not null
        if (step.selector) {
          driverStep.element = step.selector;
        }

        return driverStep;
      }),
      onCloseClick: () => {
        driverInst.destroy();
        handleTourComplete();
      },
      onNextClick: async () => {
        const currentStepIndex = driverInst.getActiveIndex?.() ?? 0;
        const stepConfig = stepsToShow[currentStepIndex];
        if (stepConfig) {
          await handleStepComplete(stepConfig.id);
        }
        driverInst.moveNext();
      },
    });

    setDriverInstance(driverInst);
    setIsTourActive(true);
    driverInst.drive();

    // Handle tour end
    const originalOnDestroyed = driverInst.destroy;
    driverInst.destroy = function() {
      handleTourComplete();
      return originalOnDestroyed.call(this);
    };
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
