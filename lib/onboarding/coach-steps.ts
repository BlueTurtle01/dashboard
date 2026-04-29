import { OnboardingConfig } from "./types";

export const coachOnboardingConfig: OnboardingConfig = {
  currentVersion: 1,
  steps: [
    {
      id: "coach_welcome",
      selector: null,
      title: "Welcome to your Coach Dashboard",
      description:
        "This quick tour takes about 60 seconds. It covers the five areas you'll use every day. You can skip at any time and re-run it from the account menu.",
      position: "bottom",
    },
    {
      id: "coach_dashboard_athlete_list",
      selector: "main",
      title: "Your Athlete Roster",
      description:
        "Every athlete linked to your account appears here. Click View to open their full profile, review their current plan, and send them a session.",
      position: "top",
      route: "/coach/dashboard",
    },
    {
      id: "coach_program_templates",
      selector: 'a[href="/coach/program-templates"]',
      title: "Program Templates",
      description:
        "Browse and manage your reusable program templates here. A template is the starting point for every new training plan you assign to an athlete.",
      position: "right",
      route: "/coach/program-templates",
    },
    {
      id: "coach_plan_builder",
      selector: "main",
      title: "Plan Builder",
      description:
        "Select an athlete, choose a template, and customise the week-by-week structure. Plans are generated and assigned in one flow.",
      position: "top",
      route: "/coach/plan",
    },
    {
      id: "coach_athlete_overview",
      selector: "main",
      title: "Athlete Overview",
      description:
        "Drill into any individual athlete — see their active plan, training log, progress metrics, and intake form answers in one place.",
      position: "top",
      route: "/coach/athlete-overview",
    },
    {
      id: "coach_chat",
      selector: 'a[href="/coach/chat"]',
      title: "Messaging",
      description:
        "Use Chat to send athlete updates, check in between sessions, and share race-day notes. All conversations are threaded by topic.",
      position: "right",
      route: "/coach/chat",
    },
    {
      id: "coach_profile",
      selector: "main",
      title: "Your Coach Profile",
      description:
        "Set your specialities, bio, and availability. Athletes browsing for a coach see this information on your public profile.",
      position: "top",
      route: "/coach/profile",
    },
  ],
};
