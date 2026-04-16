import { GeneratedPlan, PlanExercise, PlanSession } from "../planner/types";
import {
  clearActivePlan,
  loadActivePlan,
  loadPlanHistory,
  saveActivePlan,
  savePlanSnapshot,
} from "../planner/localPlanStore";

function touchPlan(plan: GeneratedPlan): GeneratedPlan {
  return {
    ...plan,
    updatedAt: new Date().toISOString(),
  };
}

export const planRepository = {
  getActivePlan(): GeneratedPlan | null {
    return loadActivePlan();
  },

  saveActivePlan(plan: GeneratedPlan) {
    saveActivePlan(touchPlan(plan));
  },

  clearActivePlan() {
    clearActivePlan();
  },

  saveSnapshot(plan: GeneratedPlan) {
    savePlanSnapshot(touchPlan(plan));
  },

  getPlanHistory(): GeneratedPlan[] {
    return loadPlanHistory();
  },

  getSessionById(sessionId: string): { plan: GeneratedPlan; session: PlanSession } | null {
    const plan = loadActivePlan();
    if (!plan) return null;

    for (const week of plan.weeks) {
      const session = week.sessions.find((item) => item.id === sessionId);
      if (session) {
        return { plan, session };
      }
    }

    return null;
  },

  updateSessionById(
    sessionId: string,
    updater: (session: PlanSession) => PlanSession
  ): GeneratedPlan | null {
    const plan = loadActivePlan();
    if (!plan) return null;

    let found = false;

    const nextPlan: GeneratedPlan = {
      ...plan,
      updatedAt: new Date().toISOString(),
      weeks: plan.weeks.map((week) => ({
        ...week,
        sessions: week.sessions.map((session) => {
          if (session.id !== sessionId) return session;
          found = true;
          return updater(session);
        }),
      })),
    };

    if (!found) return null;

    saveActivePlan(nextPlan);
    return nextPlan;
  },

  updateSessionExercisesById(
    sessionId: string,
    exercises: PlanExercise[]
  ): GeneratedPlan | null {
    return this.updateSessionById(sessionId, (session) => ({
      ...session,
      exercises: exercises.map((exercise, index) => ({
        ...exercise,
        sessionId,
        sortOrder: index + 1,
      })),
    }));
  },
};
