import IntegrationsClient from "./IntegrationsClient";

export default function IntegrationsPage({
  searchParams,
}: {
  searchParams: { tutorial?: string };
}) {
  return <IntegrationsClient tutorial={searchParams.tutorial} />;
}
