import React, { createContext, useContext, ReactNode } from "react";

interface TutorialContextType {
  isInTutorial: boolean;
  tutorialType?: string;
}

const TutorialContext = createContext<TutorialContextType>({
  isInTutorial: false,
});

export function TutorialProvider({
  children,
  isInTutorial = false,
  tutorialType,
}: {
  children: ReactNode;
  isInTutorial?: boolean;
  tutorialType?: string;
}) {
  return (
    <TutorialContext.Provider value={{ isInTutorial, tutorialType }}>
      {children}
    </TutorialContext.Provider>
  );
}

export function useTutorial() {
  return useContext(TutorialContext);
}
