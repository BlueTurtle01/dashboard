export type TooltipPosition = "top" | "bottom" | "left" | "right";

export interface OnboardingStep {
  /**
   * Stable string identifier. Never reuse or reorder — this is what gets
   * stored in completed_step_ids. Use snake_case with a role prefix.
   */
  id: string;

  /**
   * CSS selector for the element to spotlight. null = centered modal with no highlight.
   */
  selector: string | null;

  /**
   * Short heading shown in the tooltip card.
   */
  title: string;

  /**
   * Body text (can include line breaks).
   */
  description: string;

  /**
   * Preferred tooltip placement. driver.js respects this but auto-flips
   * when near viewport edge.
   */
  position: TooltipPosition;

  /**
   * If set, the tour runner will navigate to this route before activating
   * this step, waiting for the selector to appear in the DOM.
   * Omit for steps on the current page.
   */
  route?: string;
}

export interface OnboardingConfig {
  /**
   * Bump this integer any time you add or substantially change steps.
   * Users whose stored tour_version < currentVersion will be shown a
   * "You have new features to explore" prompt.
   */
  currentVersion: number;
  steps: OnboardingStep[];
}

/**
 * What is loaded from / persisted to Supabase.
 */
export interface UserOnboardingRow {
  user_id: string;
  completed_step_ids: string[];
  has_seen_tour: boolean;
  tour_version: number;
  created_at: string;
  updated_at: string;
}
