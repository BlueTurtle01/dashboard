"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getLinkedRace, getRaceReviews, type Race, type RaceReview } from "./race-data";

type ReviewMetric = {
  key: keyof RaceReview;
  notesKey: keyof RaceReview;
  label: string;
};

const REVIEW_METRICS: ReviewMetric[] = [
  { key: "drinks_station_rating", notesKey: "drinks_station_notes", label: "Drinks stations" },
  { key: "support_level_rating", notesKey: "support_level_notes", label: "Support level" },
  { key: "race_organisation_rating", notesKey: "race_organisation_notes", label: "Organisation" },
  { key: "start_finish_logistics_rating", notesKey: "start_finish_logistics_notes", label: "Start / finish" },
  { key: "course_marking_rating", notesKey: "course_marking_notes", label: "Course marking" },
  { key: "toilets_facilities_rating", notesKey: "toilets_facilities_notes", label: "Facilities" },
  { key: "atmosphere_rating", notesKey: "atmosphere_notes", label: "Atmosphere" },
  { key: "value_for_money_rating", notesKey: "value_for_money_notes", label: "Value" },
];

function getRatingValues(review: RaceReview) {
  return REVIEW_METRICS.map((metric) => review[metric.key])
    .filter((rating): rating is number => typeof rating === "number");
}

function getAverageRating(reviews: RaceReview[]) {
  const ratings = reviews.flatMap(getRatingValues);
  if (ratings.length === 0) return null;
  return ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
}

function formatRating(value: number | null) {
  return value === null ? "No rating" : `${value.toFixed(1)}/5`;
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

export default function RacePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [race, setRace] = useState<Race | null>(null);
  const [reviews, setReviews] = useState<RaceReview[]>([]);
  const [reviewsError, setReviewsError] = useState("");

  useEffect(() => {
    async function loadRace() {
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
        setReviewsError(
          reviewError instanceof Error ? reviewError.message : "Failed to load race reviews."
        );
      }

      setLoading(false);
    }

    void loadRace();
  }, []);

  if (loading) {
    return (
      <div className="px-4 py-6">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-sm text-zinc-600">Loading race...</p>
        </div>
      </div>
    );
  }

  if (error || !race) {
    return (
      <div className="px-4 py-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <h1 className="text-lg font-semibold text-red-950">Race</h1>
          <p className="mt-2 text-sm text-red-800">{error || "Unable to load race."}</p>
        </div>
      </div>
    );
  }

  const averageRating = getAverageRating(reviews);

  return (
    <div className="px-4 py-6">
      <div className="space-y-5">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Your Race</p>
          <h1 className="mt-2 text-2xl font-bold text-zinc-950">{race.name}</h1>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-zinc-600">
            {race.location && <span className="rounded-full bg-zinc-100 px-3 py-1">{race.location}</span>}
            {race.distance_km && <span className="rounded-full bg-zinc-100 px-3 py-1">{race.distance_km} km</span>}
            {race.terrain_type && <span className="rounded-full bg-zinc-100 px-3 py-1">{race.terrain_type}</span>}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="text-base font-semibold text-zinc-950">Race tools</h2>
          <div className="mt-4 divide-y divide-zinc-100">
            <Link href="/plan/race/kit-list" className="flex items-center justify-between gap-4 py-4">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-zinc-950">Kit List</span>
                <span className="mt-1 block text-sm text-zinc-600">
                  Check off the essentials and race-specific items for {race.name}.
                </span>
              </span>
              <span className="shrink-0 text-xl text-zinc-400" aria-hidden="true">
                &rsaquo;
              </span>
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-zinc-950">Race Reviews</h2>
              <p className="mt-1 text-sm text-zinc-600">
                {reviews.length > 0
                  ? `${reviews.length} review${reviews.length === 1 ? "" : "s"} from runners who know this race.`
                  : "No reviews have been added for this race yet."}
              </p>
            </div>
            {reviews.length > 0 && (
              <div className="shrink-0 rounded-xl bg-zinc-950 px-3 py-2 text-right text-white">
                <p className="text-xs font-medium text-zinc-300">Average</p>
                <p className="text-lg font-bold">{formatRating(averageRating)}</p>
              </div>
            )}
          </div>

          {reviewsError ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-900">Reviews could not be loaded: {reviewsError}</p>
            </div>
          ) : reviews.length > 0 ? (
            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {REVIEW_METRICS.map((metric) => {
                  const metricRatings = reviews
                    .map((review) => review[metric.key])
                    .filter((rating): rating is number => typeof rating === "number");
                  if (metricRatings.length === 0) return null;

                  const average =
                    metricRatings.reduce((sum, rating) => sum + rating, 0) / metricRatings.length;

                  return (
                    <div key={metric.label} className="rounded-xl bg-zinc-50 p-3">
                      <p className="text-xs font-medium text-zinc-500">{metric.label}</p>
                      <p className="mt-1 text-base font-semibold text-zinc-950">{formatRating(average)}</p>
                    </div>
                  );
                })}
              </div>

              <div className="divide-y divide-zinc-100">
                {reviews.map((review) => {
                  const reviewAverage = getAverageRating([review]);
                  const notes = REVIEW_METRICS.map((metric) => ({
                    label: metric.label,
                    value: review[metric.notesKey],
                  })).filter((note): note is { label: string; value: string } => typeof note.value === "string" && note.value.trim().length > 0);

                  return (
                    <article key={review.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-zinc-950">{getReviewerName(review)}</h3>
                            {review.is_verified && (
                              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                                Verified
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-zinc-500">{formatReviewDate(review.created_at)}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">
                          {formatRating(reviewAverage)}
                        </span>
                      </div>

                      {review.general_review && (
                        <p className="mt-3 text-sm leading-6 text-zinc-700">{review.general_review}</p>
                      )}

                      {notes.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {notes.map((note) => (
                            <p key={`${review.id}-${note.label}`} className="text-sm text-zinc-600">
                              <span className="font-semibold text-zinc-800">{note.label}:</span> {note.value}
                            </p>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
