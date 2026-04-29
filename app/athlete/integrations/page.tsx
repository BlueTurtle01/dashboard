import StravaIntegration from "./StravaIntegration";

export default function IntegrationsPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Integrations</h1>
        <p className="text-gray-600 mb-8">Manage your connected services and activity syncing.</p>

        <StravaIntegration />
      </div>
    </div>
  );
}
