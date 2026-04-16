import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Which Feeder Race Should You Do Before MDS?',
  description:
    'Get a free personalised feeder race recommendation based on your fitness, experience, and goals. Find your best stepping stone to Marathon des Sables.',
};

// ---------------------------------------------------------
// Sub-components
// ---------------------------------------------------------

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block bg-amber-100 text-amber-800 text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wide">
      {children}
    </span>
  );
}

function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-white text-xs font-bold">
        ✓
      </span>
      <span className="text-gray-700 leading-snug">{children}</span>
    </li>
  );
}

function ExampleCard({
  emoji,
  profile,
  recommendation,
  reason,
}: {
  emoji: string;
  profile: string;
  recommendation: string;
  reason: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
      <div className="text-3xl mb-3">{emoji}</div>
      <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Runner profile
      </p>
      <p className="text-gray-800 mb-4 text-sm leading-relaxed">{profile}</p>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
          Recommended race
        </p>
        <p className="font-semibold text-gray-900 text-sm">{recommendation}</p>
        <p className="text-gray-600 text-xs mt-1 leading-relaxed">{reason}</p>
      </div>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <div className="border-b border-gray-200 pb-5">
      <p className="font-semibold text-gray-900 mb-2">{q}</p>
      <p className="text-gray-600 leading-relaxed text-sm">{a}</p>
    </div>
  );
}

// ---------------------------------------------------------
// Page
// ---------------------------------------------------------
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      {/* ===== NAV ===== */}
      <nav className="border-b border-gray-100 px-6 py-4 flex items-center justify-between max-w-5xl mx-auto">
        <span className="font-bold text-gray-900 tracking-tight">Race Readiness</span>
        <Link
          href="/funnel/feeder-race-finder/assess"
          className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          Start free assessment →
        </Link>
      </nav>

      {/* ===== HERO ===== */}
      <section className="bg-gradient-to-b from-gray-950 to-gray-800 text-white px-6 py-20 md:py-28">
        <div className="max-w-3xl mx-auto text-center">
          <Pill>Free personalised race finder</Pill>
          <h1 className="mt-6 text-4xl md:text-5xl font-extrabold leading-tight tracking-tight">
            Which feeder race should you do
            <br className="hidden md:block" />
            <span className="text-amber-400"> before Marathon des Sables?</span>
          </h1>
          <p className="mt-6 text-lg text-gray-300 leading-relaxed max-w-2xl mx-auto">
            Get a free personalised recommendation based on your fitness, race history,
            budget, and real-life constraints. Find out exactly which race is the right
            next step — and why.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/funnel/feeder-race-finder/assess"
              className="bg-amber-500 hover:bg-amber-400 text-white font-bold px-8 py-4 rounded-xl text-lg transition-colors shadow-lg"
            >
              Get my free recommendation →
            </Link>
          </div>
          <p className="mt-4 text-gray-400 text-sm">
            Takes 4–5 minutes. No login required.
          </p>
        </div>
      </section>

      {/* ===== WHO THIS IS FOR ===== */}
      <section className="px-6 py-16 max-w-3xl mx-auto">
        <p className="text-amber-600 font-semibold text-sm uppercase tracking-wide text-center mb-3">
          Who this is for
        </p>
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-10 text-gray-900">
          You don&rsquo;t have to figure this out by guessing
        </h2>
        <ul className="space-y-4">
          <CheckItem>
            You&rsquo;ve completed a marathon or similar event and you&rsquo;re wondering what comes next
          </CheckItem>
          <CheckItem>
            You&rsquo;re interested in Marathon des Sables but have no idea where to start
          </CheckItem>
          <CheckItem>
            You&rsquo;ve heard of the feeder races but can&rsquo;t work out which one actually makes sense for you
          </CheckItem>
          <CheckItem>
            You have real constraints — work, family, budget, training access — and you need advice that takes those seriously
          </CheckItem>
          <CheckItem>
            You want a considered recommendation, not a generic list of &ldquo;top desert races&rdquo; copied from a blog post
          </CheckItem>
        </ul>
      </section>

      {/* ===== WHAT YOU WILL GET ===== */}
      <section className="bg-gray-50 px-6 py-16">
        <div className="max-w-3xl mx-auto">
          <p className="text-amber-600 font-semibold text-sm uppercase tracking-wide text-center mb-3">
            What you&rsquo;ll get
          </p>
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-10 text-gray-900">
            A personalised race report, not a generic quiz result
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                title: 'Your best-fit feeder race',
                desc: 'The race most likely to prepare you well, given your background, schedule, and goals.',
              },
              {
                title: 'Two strong alternatives',
                desc: 'Different options with different trade-offs — if the primary race doesn\'t suit your timing or budget.',
              },
              {
                title: 'A lower-risk option',
                desc: 'A more achievable race if you want to build confidence first before taking on a bigger challenge.',
              },
              {
                title: 'A stretch option',
                desc: 'A more ambitious race for those who want to push harder and accelerate their MDS preparation.',
              },
              {
                title: 'Why each race fits you',
                desc: 'Specific explanations of why each recommendation suits your current situation — not generic scoring.',
              },
              {
                title: 'Your MDS preparation gaps',
                desc: 'An honest look at what you still need to develop before you\'re ready for Marathon des Sables itself.',
              },
            ].map((item) => (
              <div key={item.title} className="bg-white border border-gray-200 rounded-xl p-5">
                <p className="font-semibold text-gray-900 mb-1">{item.title}</p>
                <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== EXAMPLE OUTPUTS ===== */}
      <section className="px-6 py-16 max-w-5xl mx-auto">
        <p className="text-amber-600 font-semibold text-sm uppercase tracking-wide text-center mb-3">
          Example results
        </p>
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-10 text-gray-900">
          Different backgrounds, different recommendations
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ExampleCard
            emoji="🏃‍♀️"
            profile="First marathon completed. Training 4 days/week on road. UK-based, budget around £1,500. No desert or heat experience. Targeting MDS in 2–3 years."
            recommendation="Wadi Rum Ultra (Jordan)"
            reason="A single-stage 50k desert race at an accessible price — builds desert confidence without the commitment of a 6-stage event."
          />
          <ExampleCard
            emoji="🎒"
            profile="50k ultra completed. Trains 5 days/week with some trail. Has done a 2-day trail race. Heat experience limited. Budget ~£3,000. Targeting MDS within 18 months."
            recommendation="Ultra X Jordan"
            reason="A 5-stage self-supported desert race in Wadi Rum — develops pack carrying, stage-racing, and desert heat experience in one event."
          />
          <ExampleCard
            emoji="🔥"
            profile="Multiple ultramarathons completed, including a 100k. Regular trail runner. Good heat adaptation. Budget over £4,000. Wants the closest MDS simulation available."
            recommendation="Sahara Race Egypt (4 Deserts)"
            reason="The gold standard for MDS preparation — 250km self-supported across 6 stages in extreme Saharan heat."
          />
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="bg-gray-950 text-white px-6 py-16">
        <div className="max-w-3xl mx-auto">
          <p className="text-amber-400 font-semibold text-sm uppercase tracking-wide text-center mb-3">
            How it works
          </p>
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">
            Simple. Takes less than 5 minutes.
          </h2>
          <div className="space-y-8">
            {[
              {
                step: '01',
                title: 'Answer a short assessment',
                desc: 'We ask about your race history, training, budget, schedule, and MDS goals. No unnecessary questions — just what we need to give you a useful recommendation.',
              },
              {
                step: '02',
                title: 'We score you against our race database',
                desc: 'Our scoring engine compares your profile against each race across dimensions like endurance fit, heat readiness, budget, travel, and MDS progression value.',
              },
              {
                step: '03',
                title: 'You get a personalised report',
                desc: 'We show you the best-fit race plus alternatives, with specific explanations of why each suits you and what gaps you still need to close before MDS.',
              },
            ].map((item) => (
              <div key={item.step} className="flex gap-6 items-start">
                <span className="flex-shrink-0 text-amber-400 font-black text-3xl w-10">
                  {item.step}
                </span>
                <div>
                  <p className="font-semibold text-lg mb-1">{item.title}</p>
                  <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-14 text-center">
            <Link
              href="/funnel/feeder-race-finder/assess"
              className="inline-block bg-amber-500 hover:bg-amber-400 text-white font-bold px-8 py-4 rounded-xl text-lg transition-colors"
            >
              Start free assessment →
            </Link>
            <p className="mt-3 text-gray-500 text-sm">No account needed. Results in minutes.</p>
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section className="px-6 py-16 max-w-3xl mx-auto">
        <p className="text-amber-600 font-semibold text-sm uppercase tracking-wide text-center mb-3">
          FAQ
        </p>
        <h2 className="text-2xl font-bold text-center mb-10 text-gray-900">
          Common questions
        </h2>
        <div className="space-y-5">
          <FaqItem
            q="Do I need to have done an ultramarathon before?"
            a="No. The assessment is designed for everyone from first-time marathon runners to experienced ultra runners. We'll recommend a race that suits your current level, whatever that is."
          />
          <FaqItem
            q="Is this just for people targeting Marathon des Sables?"
            a="Primarily, yes — but the recommendations are useful for anyone interested in desert or multi-stage racing, regardless of whether MDS is their specific goal."
          />
          <FaqItem
            q="How accurate are the recommendations?"
            a="They're based on your honest answers to the assessment. The more accurately you answer, the more useful your result will be. These are good-faith recommendations based on a structured scoring model — not a guarantee of race outcome."
          />
          <FaqItem
            q="Is this free?"
            a="Yes, completely free. No payment, no login, no subscription."
          />
          <FaqItem
            q="What happens to my data?"
            a="Your name and email are stored so we can send your results and, if you agree, occasional relevant training content. We don't sell your data or share it with third parties."
          />
          <FaqItem
            q="Can I get coaching support after this?"
            a="Yes. If you'd like personalised coaching support for your MDS preparation, our coaches can help you build a structured plan from here. Your assessment data will be available to inform that conversation."
          />
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="bg-amber-500 px-6 py-16">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-4">
            Find your best next race. Free.
          </h2>
          <p className="text-amber-100 text-lg mb-8 leading-relaxed">
            Stop guessing which feeder race is right for you. Get a personalised
            recommendation based on your background and goals.
          </p>
          <Link
            href="/funnel/feeder-race-finder/assess"
            className="inline-block bg-white text-amber-600 hover:bg-amber-50 font-bold px-8 py-4 rounded-xl text-lg transition-colors shadow-md"
          >
            Get my free recommendation →
          </Link>
          <p className="mt-4 text-amber-200 text-sm">Takes 4–5 minutes. No login required.</p>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="border-t border-gray-100 px-6 py-8 text-center text-gray-400 text-sm">
        <p>© {new Date().getFullYear()} Race Readiness. All rights reserved.</p>
      </footer>
    </div>
  );
}
