import { OnboardingConfig } from "./types";

export const athleteOnboardingConfig: OnboardingConfig = {
  currentVersion: 2,
  steps: [
    {
      id: "athlete_welcome",
      selector: null,
      title: "Welcome to your Training Hub",
      description:
        "A 60-second tour of the five sections you'll use each week. Skip at any time — you can always restart from the account menu.",
      position: "bottom",
    },
    {
      id: "athlete_plan_week_nav",
      selector: ".rounded-2xl.border.border-zinc-200.bg-white.p-5",
      title: "Your Weekly Plan",
      description:
        "This is your current training week. Use the Prev / Next buttons to browse ahead or review past weeks. Sessions turn green once you mark them complete.",
      position: "top",
      route: "/athlete",
    },
    {
      id: "athlete_session_detail",
      selector: ".space-y-6 a.block.rounded-xl",
      title: "Session Cards",
      description:
        "Tap any session to see the full brief — drills, pacing targets, elevation notes, and the reason your coach chose this workout for you.",
      position: "top",
      route: "/athlete",
    },
    {
      id: "athlete_log",
      selector: 'a[href="/athlete/log"]',
      title: "Training Log",
      description:
        "After each session, log your actual effort, perceived exertion, and any notes. This feeds your progress charts and helps your coach adjust the plan.",
      position: "right",
      route: "/athlete/log",
    },
    {
      id: "athlete_progress",
      selector: "main",
      title: "Progress Charts",
      description:
        "View your weekly volume, intensity distribution, and long-run history over time. Updated automatically as you log sessions.",
      position: "top",
      route: "/athlete/progress",
    },
    {
      id: "athlete_profile_intake",
      selector: "main",
      title: "Your Profile & Intake Form",
      description:
        "Keep your injury history, event goal, and availability up to date. Your coach uses this to personalise every plan they build for you.",
      position: "top",
      route: "/athlete/profile",
    },
    {
      id: "athlete_chat",
      selector: 'a[href="/athlete/chat"]',
      title: "Chat with your Coach",
      description:
        "If you ever want to chat with your coach, click here. Have a question about a session or need to flag an injury? Use Chat to message your coach directly. Conversations are organised by thread.",
      position: "right",
      route: "/athlete/chat",
    },
  ],
};
