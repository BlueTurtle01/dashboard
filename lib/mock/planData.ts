export type DraftPlanWeek = {
  weekNumber: number;
  focus: string;
  notes: string;
  sessions: string[];
};

export const draftPlanWeeks: DraftPlanWeek[] = [
  {
    weekNumber: 1,
    focus: "Base",
    notes: "Introduce consistent volume without pushing intensity too early.",
    sessions: [
      "Easy Run - 45 min",
      "Steady Run - 35 min",
      "Long Run - 75 min",
    ],
  },
  {
    weekNumber: 2,
    focus: "Base",
    notes: "Small increase in total work. Keep recovery controlled.",
    sessions: [
      "Easy Run - 45 min",
      "Hill Repeats - 6 x 60 sec",
      "Long Run - 85 min",
    ],
  },
  {
    weekNumber: 3,
    focus: "Build",
    notes: "First proper quality week. Watch fatigue and sleep closely.",
    sessions: [
      "Recovery Run - 30 min",
      "Threshold Run - 3 x 8 min",
      "Long Run - 95 min",
    ],
  },
  {
    weekNumber: 4,
    focus: "Build",
    notes: "Holiday conflict detected in this example week.",
    sessions: [
      "Easy Run - 35 min",
      "Tempo Run - 20 min continuous",
      "Long Run - 70 min",
    ],
  },
];

export const sampleWarnings = [
  "Holiday overlaps a build week. Consider shifting the block by one week.",
  "Taper is currently only 1 week in the draft plan.",
  "Weekly load jump from week 2 to week 3 may be too aggressive.",
];

export const coachQueue = [
  {
    athleteName: "Sam Carter",
    eventName: "Peak Divide 50K",
    status: "Awaiting review",
    submittedAt: "31 Mar 2026",
  },
  {
    athleteName: "Mia Evans",
    eventName: "Snowline Ultra",
    status: "Draft in progress",
    submittedAt: "30 Mar 2026",
  },
  {
    athleteName: "Tom Patel",
    eventName: "Ridgeway 24 Hour",
    status: "Ready to deliver",
    submittedAt: "29 Mar 2026",
  },
];
