import Link from "next/link";

export default function HelpPage() {
  return (
    <div className="py-6 space-y-4">
      <div className="space-y-3">
        <Link
          href="/knowledge-base"
          className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm transition-all"
        >
          <div>
            <h3 className="font-semibold text-zinc-900">Knowledge Base</h3>
            <p className="text-sm text-zinc-500">Read answers to common questions</p>
          </div>
          <span className="text-zinc-400">→</span>
        </Link>

        <a
          href="https://feedback.yourapp.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm transition-all"
        >
          <div>
            <h3 className="font-semibold text-zinc-900">Suggest a Feature</h3>
            <p className="text-sm text-zinc-500">Tell us what you'd like to see</p>
          </div>
          <span className="text-zinc-400">→</span>
        </a>

        <Link
          href="/support"
          className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm transition-all"
        >
          <div>
            <h3 className="font-semibold text-zinc-900">Support Tickets</h3>
            <p className="text-sm text-zinc-500">Get help with your account</p>
          </div>
          <span className="text-zinc-400">→</span>
        </Link>
      </div>
    </div>
  );
}
