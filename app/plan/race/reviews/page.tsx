"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getLinkedRace, getRaceReviews, type Race, type RaceReview } from "../race-data";

type ReviewMetric = {
  key: keyof RaceReview;
  notesKey: keyof RaceReview;
  label: string;
};

const REVIEW_METRICS: ReviewMetric[] = [
  { key: "drinks_station_rating", notesKey: "drinks_station_notes", label: "Drinks stations" },
  { key: "support_level_rating", notesKey: "support_level_notes", label: "Support level" },
  { key: "race_organisation_rating", notesKey: "race_organisation_notes", label: "Organisation" },
  { key: "start_finish_logistics_rating", notesKey: "start_finish_logistics_notes", label: "Start / finish logistics" },
  { key: "course_marking_rating", notesKey: "course_marking_notes", label: "Course marking" },
  { key: "toilets_facilities_rating", notesKey: "toilets_facilities_notes", label: "Toilets & facilities" },
  { key: "atmosphere_rating", notesKey: "atmosphere_notes", label: "Atmosphere" },
  { key: "value_for_money_rating", notesKey: "value_for_money_notes", label: "Value for money" },
];

function getRatingValues(review: RaceReview) {
  return REVIEW_METRICS.map((metric) => review[metric.key]).filter(
    (rating): rating is number => typeof rating === "number"
  );
}

function getAverageRating(reviews: RaceReview[]) {
  const ratings = reviews.flatMap(getRatingValues);
  if (ratings.length === 0) return null;
  return ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
}

function getMetricAverage(reviews: RaceReview[], metric: ReviewMetric) {
  const ratings = reviews
    .map((review) => review[metric.key])
    .filter((rating): rating is number => typeof rating === "number");

  if (ratings.length === 0) return null;
  return ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
}

function formatRating(value: number | null) {
  return value === null ? "No rating" : value.toFixed(1);
}

function formatReviewDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function getReviewerName(review: RaceReview) {
  return review.strava_athlete_name || review.reviewer_name || "Anonymous runner";
}

function getReviewNotes(review: RaceReview) {
  return REVIEW_METRICS.map((metric) => ({
    label: metric.label,
    rating: review[metric.key],
    note: review[metric.notesKey],
  })).filter(
    (item): item is { label: string; rating: number | null; note: string } =>
      typeof item.note === "string" && item.note.trim().length > 0
  );
}

export default function RaceReviewsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [race, setRace] = useState<Race | null>(null);
  const [reviews, setReviews] = useState<RaceReview[]>([]);

  useEffect(() => {
    async function loadRaceReviews() {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setError("Unable to authenticate.");
        setLoading(false);
        return;
      }

      const linkedRace = await getLinkedRace(supabase, user.id);

      if (!linkedRace) {
        setError("No race is linked to your active plan yet.");
        setLoading(false);
        return;
      }

      setRace(linkedRace);

      try {
        const raceReviews = await getRaceReviews(supabase, linkedRace.slug);
        setReviews(raceReviews);
      } catch (reviewError) {
        setError(reviewError instanceof Error ? reviewError.message : "Failed to load race reviews.");
      }

      setLoading(false);
    }

    void loadRaceReviews();
  }, []);

  const averageRating = useMemo(() => getAverageRating(reviews), [reviews]);
  const verifiedCount = reviews.filter((review) => review.is_verified).length;

  if (loading) {
    return (
      <div className="px-4 py-6">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-sm text-zinc-600">Loading race reviews...</p>
        </div>
      </div>
    );
  }

  if (error || !race) {
    return (
      <div className="px-4 py-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <h1 className="text-lg font-semibold text-red-950">Race Reviews</h1>
          <p className="mt-2 text-sm text-red-800">{error || "Unable to load race reviews."}</p>
          <Link href="/plan/race" className="mt-4 inline-flex text-sm font-semibold text-red-950">
            Back to Race
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white">
      <section className="border-b border-zinc-200 bg-zinc-950 px-4 py-8 text-white">
        <div className="mx-auto max-w-3xl">
          <Link href="/plan/race" className="text-sm font-semibold text-zinc-300">
            Back to Race
          </Link>
          <p className="mt-8 text-xs font-semibold uppercase tracking-wide text-lime-300">Race Reviews</p>
          <h1 className="mt-2 text-3xl font-bold leading-tight">{race.name}</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-300">
            Verified runner feedback on support, organisation, logistics, facilities, atmosphere, and value.
          </p>

          <div className="mt-6 grid grid-cols-3 divide-x divide-white/15 rounded-xl border border-white/15 bg-white/10">
            <div className="p-4">
              <p className="text-2xl font-bold">{formatRating(averageRating)}</p>
              <p className="mt-1 text-xs font-medium text-zinc-300">Average</p>
            </div>
            <div className="p-4">
              <p className="text-2xl font-bold">{reviews.length}</p>
              <p className="mt-1 text-xs font-medium text-zinc-300">Reviews</p>
            </div>
            <div className="p-4">
              <p className="text-2xl font-bold">{verifiedCount}</p>
              <p className="mt-1 text-xs font-medium text-zinc-300">Verified</p>
            </div>
          </div>
        </div>
      </section>

      {reviews.length === 0 ? (
        <section className="px-4 py-8">
          <div className="mx-auto max-w-3xl border-y border-zinc-200 py-8">
            <h2 className="text-2xl font-bold text-zinc-950">No reviews yet</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              Reviews will appear here once runners have shared feedback for this race.
            </p>
          </div>
        </section>
      ) : (
        <>
          <section className="border-b border-zinc-200 bg-zinc-50 px-4 py-8">
            <div className="mx-auto max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-wide text-lime-700">Rating Breakdown</p>
              <h2 className="mt-2 text-2xl font-bold text-zinc-950">What runners say matters</h2>

              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {REVIEW_METRICS.map((metric) => {
                  const average = getMetricAverage(reviews, metric);
                  if (average === null) return null;
                  const percentage = `${Math.round((average / 5) * 100)}%`;

                  return (
                    <div key={metric.label} className="rounded-xl border border-zinc-200 bg-white p-4">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="text-sm font-semibold text-zinc-950">{metric.label}</h3>
                        <p className="text-lg font-bold text-zinc-950">{formatRating(average)}</p>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
                        <div className="h-full rounded-full bg-lime-500" style={{ width: percentage }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="px-4 py-8">
            <div className="mx-auto max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-wide text-lime-700">Runner Feedback</p>
              <h2 className="mt-2 text-2xl font-bold text-zinc-950">Full reviews</h2>

              <div className="mt-6 divide-y divide-zinc-200 border-y border-zinc-200">
                {reviews.map((review) => {
                  const reviewAverage = getAverageRating([review]);
                  const notes = getReviewNotes(review);

                  return (
                    <article key={review.id} className="py-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-bold text-zinc-950">{getReviewerName(review)}</h3>
                            {review.is_verified && (
                              <span className="rounded-full bg-lime-100 px-2.5 py-1 text-xs font-semibold text-lime-800">
                                Verified athlete
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs font-medium text-zinc-500">{formatReviewDate(review.created_at)}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-2xl font-bold text-zinc-950">{formatRating(reviewAverage)}</p>
                          <p className="text-xs font-medium text-zinc-500">out of 5</p>
                        </div>
                      </div>

                      {review.general_review && (
                        <p className="mt-5 text-base leading-7 text-zinc-800">{review.general_review}</p>
                      )}

                      {notes.length > 0 && (
                        <div className="mt-5 space-y-3">
                          {notes.map((note) => (
                            <div key={`${review.id}-${note.label}`} className="border-l-2 border-lime-500 pl-4">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-zinc-950">{note.label}</p>
                                {typeof note.rating === "number" && (
                                  <p className="text-sm font-bold text-zinc-700">{note.rating}/5</p>
                                )}
                              </div>
                              <p className="mt-1 text-sm leading-6 text-zinc-600">{note.note}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
