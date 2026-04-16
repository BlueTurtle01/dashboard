// Funnel layout — no Navbar, clean slate for public-facing pages
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Which Feeder Race Should You Do Before MDS? | Personalised Race Finder',
  description:
    'Get a free personalised feeder race recommendation based on your fitness, experience, and goals. Find your best stepping stone to Marathon des Sables.',
};

export default function FunnelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
