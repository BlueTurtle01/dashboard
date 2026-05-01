"use client";

import { TutorialProvider, useTutorial } from "@/lib/context/TutorialContext";
import TutorialInfoBox from "@/components/tutorial/TutorialInfoBox";
import StravaIntegration from "./StravaIntegration";

function IntegrationsContent() {
  const { isInTutorial } = useTutorial();

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {isInTutorial && (
          <div style={{ marginBottom: "20px" }}>
            <TutorialInfoBox
              title="Connect Your Training Apps"
              description="Integrate with services like Strava to automatically sync your activities. This helps your coach see your actual training and adjust your plan accordingly."
              step={1}
              totalSteps={1}
              showNext={false}
            />
          </div>
        )}

        <h1 className="text-3xl font-bold mb-2">Integrations</h1>
        <p className="text-gray-600 mb-8">Manage your connected services and activity syncing.</p>

        <StravaIntegration />
      </div>
    </div>
  );
}

export default function IntegrationsClient({
  tutorial,
}: {
  tutorial?: string;
}) {
  const isInTutorial = tutorial === "integrations";

  return (
    <TutorialProvider isInTutorial={isInTutorial} tutorialType="integrations">
      <IntegrationsContent />
    </TutorialProvider>
  );
}
