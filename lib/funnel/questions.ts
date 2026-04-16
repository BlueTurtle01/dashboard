// =========================================================
// Question Configuration
// Defines the multi-step assessment questionnaire structure.
// The UI renders from this config — add/remove questions here.
// =========================================================

export type QuestionType =
  | 'single_select'
  | 'multi_select'
  | 'number'
  | 'text'
  | 'email'
  | 'boolean'
  | 'slider';

export interface QuestionOption {
  value: string;
  label: string;
  description?: string;
}

export interface Question {
  key: string;
  type: QuestionType;
  label: string;
  description?: string;
  options?: QuestionOption[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  required?: boolean;
  placeholder?: string;
}

export interface AssessmentSection {
  id: string;
  title: string;
  subtitle: string;
  questions: Question[];
}

// ---------------------------------------------------------
// Section definitions
// ---------------------------------------------------------
export const ASSESSMENT_SECTIONS: AssessmentSection[] = [
  {
    id: 'contact',
    title: 'Let\'s get started',
    subtitle: 'Tell us a little about yourself so we can personalise your recommendation.',
    questions: [
      {
        key: 'first_name',
        type: 'text',
        label: 'Your first name',
        required: true,
        placeholder: 'e.g. Sarah',
      },
      {
        key: 'email',
        type: 'email',
        label: 'Your email address',
        description: 'We\'ll send your personalised race report here.',
        required: true,
        placeholder: 'you@example.com',
      },
      {
        key: 'country_of_residence',
        type: 'text',
        label: 'Country you live in',
        description: 'Helps us factor in travel distance and logistics.',
        required: false,
        placeholder: 'e.g. United Kingdom',
      },
      {
        key: 'consent_marketing',
        type: 'boolean',
        label: 'Send me occasional training tips and race insights',
        description: 'No spam. You can unsubscribe anytime.',
        required: false,
      },
    ],
  },

  {
    id: 'endurance_base',
    title: 'Your endurance background',
    subtitle: 'Help us understand what you\'ve done so far.',
    questions: [
      {
        key: 'longest_completed_race',
        type: 'single_select',
        label: 'What\'s the longest race you\'ve completed in the last 2 years?',
        required: true,
        options: [
          { value: 'none', label: 'None yet', description: 'I\'m working my way up' },
          { value: 'half_marathon', label: 'Half marathon (21k)' },
          { value: 'marathon', label: 'Marathon (42k)' },
          { value: '50k', label: '50k ultramarathon' },
          { value: '50_mile', label: '50 mile / 80k ultramarathon' },
          { value: '100k', label: '100k ultramarathon' },
          { value: '100_mile', label: '100 mile (160k) ultramarathon' },
          { value: 'multi_stage', label: 'Multi-stage ultra (2+ days)' },
          { value: 'other', label: 'Other long event' },
        ],
      },
      {
        key: 'longest_recent_effort_hours',
        type: 'single_select',
        label: 'What\'s the longest single run or hike you\'ve done in the last 8 weeks?',
        required: false,
        options: [
          { value: '1', label: 'Under 1 hour' },
          { value: '2', label: '1–2 hours' },
          { value: '3', label: '2–3 hours' },
          { value: '5', label: '3–5 hours' },
          { value: '8', label: '5–8 hours' },
          { value: '12', label: '8–12 hours' },
          { value: '15', label: 'More than 12 hours' },
        ],
      },
      {
        key: 'training_days_per_week',
        type: 'single_select',
        label: 'How many days per week do you currently train?',
        required: false,
        options: [
          { value: '1', label: '1 day' },
          { value: '2', label: '2 days' },
          { value: '3', label: '3 days' },
          { value: '4', label: '4 days' },
          { value: '5', label: '5 days' },
          { value: '6', label: '6–7 days' },
        ],
      },
      {
        key: 'prior_experience',
        type: 'multi_select',
        label: 'Which of these have you completed before?',
        description: 'Select all that apply.',
        required: false,
        options: [
          { value: 'marathon', label: 'Road marathon' },
          { value: 'trail_marathon', label: 'Trail marathon' },
          { value: 'ultra', label: 'Ultramarathon (any distance)' },
          { value: 'multi_stage', label: 'Multi-stage race (2+ days)' },
          { value: 'pack_carry', label: 'Self-supported / pack-carry event' },
        ],
      },
    ],
  },

  {
    id: 'terrain',
    title: 'Terrain and conditions',
    subtitle: 'What does your training environment look like?',
    questions: [
      {
        key: 'main_terrain_type',
        type: 'single_select',
        label: 'What terrain do you train on most often?',
        required: false,
        options: [
          { value: 'road', label: 'Road', description: 'Mainly tarmac and pavement' },
          { value: 'flat_trail', label: 'Flat trail', description: 'Off-road but mostly flat' },
          { value: 'hilly_trail', label: 'Hilly trail', description: 'Off-road with regular climbs' },
          { value: 'technical_trail', label: 'Technical trail', description: 'Rocky, rooty, demanding underfoot' },
          { value: 'mixed', label: 'Mixed', description: 'A combination of the above' },
        ],
      },
      {
        key: 'hill_frequency',
        type: 'single_select',
        label: 'How often do you train on hills?',
        required: false,
        options: [
          { value: 'never', label: 'Rarely or never' },
          { value: 'sometimes', label: 'Sometimes (monthly)' },
          { value: 'often', label: 'Often (weekly)' },
          { value: 'always', label: 'Most sessions include hills' },
        ],
      },
      {
        key: 'desert_terrain_access',
        type: 'boolean',
        label: 'Do you have access to sandy, loose, or desert-like terrain to train on?',
        description: 'Dunes, sandy beaches, quarry tracks, loose gravel paths, etc.',
        required: false,
      },
      {
        key: 'uneven_ground_comfort',
        type: 'single_select',
        label: 'How comfortable are you running on uneven, technical ground?',
        required: false,
        options: [
          { value: 'uncomfortable', label: 'Not very — I prefer predictable surfaces' },
          { value: 'ok', label: 'OK — I manage but it slows me down a lot' },
          { value: 'comfortable', label: 'Comfortable — I enjoy technical terrain' },
          { value: 'very_comfortable', label: 'Very comfortable — technical ground is my strength' },
        ],
      },
    ],
  },

  {
    id: 'stage_pack',
    title: 'Stage racing and pack carrying',
    subtitle: 'Multi-stage desert races add unique demands beyond single-stage ultras.',
    questions: [
      {
        key: 'has_multi_stage_experience',
        type: 'boolean',
        label: 'Have you completed a multi-stage race (2 or more race days back to back)?',
        required: false,
      },
      {
        key: 'has_pack_experience',
        type: 'boolean',
        label: 'Have you trained or raced carrying a loaded pack (5kg+)?',
        description: 'Marathon des Sables requires carrying all food, sleeping gear and kit — typically 8–14kg.',
        required: false,
      },
      {
        key: 'multi_day_fatigue_comfort',
        type: 'single_select',
        label: 'How comfortable are you with multi-day accumulated fatigue?',
        description: 'Running tired the day after a long effort.',
        required: false,
        options: [
          { value: 'low', label: 'Not at all — I need proper recovery between hard sessions' },
          { value: 'medium', label: 'Moderate — I\'ve done back-to-back training but it\'s tough' },
          { value: 'high', label: 'Comfortable — I regularly train on consecutive hard days' },
        ],
      },
      {
        key: 'stage_preference',
        type: 'single_select',
        label: 'Would you prefer your next race to be…',
        required: false,
        options: [
          { value: 'single_stage', label: 'A single-stage ultra', description: 'One race day, one distance' },
          { value: 'stage_race', label: 'A stage race', description: 'Multiple race days back to back' },
          { value: 'either', label: 'I\'m open to either' },
        ],
      },
    ],
  },

  {
    id: 'heat',
    title: 'Heat and climate experience',
    subtitle: 'Desert racing in 40°C+ heat is one of the biggest challenges. Let\'s understand where you are.',
    questions: [
      {
        key: 'lives_in_hot_climate',
        type: 'boolean',
        label: 'Do you currently live and train in a hot climate?',
        description: 'Regular summer temperatures above 30°C counts.',
        required: false,
      },
      {
        key: 'has_raced_in_heat',
        type: 'boolean',
        label: 'Have you raced or completed a long training session in significant heat (30°C+)?',
        required: false,
      },
      {
        key: 'struggled_badly_in_heat',
        type: 'boolean',
        label: 'Have you ever struggled badly in heat — felt unwell, dropped out, or significantly underperformed?',
        required: false,
      },
      {
        key: 'willing_heat_training',
        type: 'boolean',
        label: 'Are you willing and able to do structured heat training before your next race?',
        description: 'Sauna sessions, running in the warmest part of the day, heated treadmill sessions, etc.',
        required: false,
      },
      {
        key: 'heat_preference',
        type: 'single_select',
        label: 'For your next race, what\'s your preference around heat?',
        required: false,
        options: [
          { value: 'avoid_heat', label: 'Avoid extreme heat — I\'m not ready for that yet' },
          { value: 'some_heat', label: 'Some heat is fine — I want to start building that tolerance' },
          { value: 'desert_heat', label: 'I want a hot, desert race — simulate MDS conditions as closely as possible' },
        ],
      },
    ],
  },

  {
    id: 'budget_logistics',
    title: 'Budget and logistics',
    subtitle: 'Practical constraints matter. Let\'s find a race that actually works for your life.',
    questions: [
      {
        key: 'total_budget_gbp',
        type: 'single_select',
        label: 'What\'s your approximate total budget for your next race including flights and travel?',
        required: false,
        options: [
          { value: '400', label: 'Under £500' },
          { value: '750', label: '£500–£1,000' },
          { value: '1500', label: '£1,000–£2,000' },
          { value: '2750', label: '£2,000–£3,500' },
          { value: '5000', label: 'Over £3,500' },
        ],
      },
      {
        key: 'travel_distance_willingness',
        type: 'single_select',
        label: 'How far are you willing to travel for your next race?',
        required: false,
        options: [
          { value: 'domestic', label: 'Within my own country only' },
          { value: 'short_haul', label: 'Short-haul international (Europe, North Africa, Middle East)' },
          { value: 'long_haul', label: 'Long-haul international (Americas, Asia, sub-Saharan Africa)' },
          { value: 'anywhere', label: 'Anywhere in the world' },
        ],
      },
      {
        key: 'needs_minimal_time_away',
        type: 'boolean',
        label: 'Do you need to keep time away from work or family to a minimum?',
        description: 'Multi-stage races typically mean 10–14 days away from home.',
        required: false,
      },
      {
        key: 'prefers_simple_logistics',
        type: 'boolean',
        label: 'Would you prefer a race with simpler logistics — easier flights, well-organised setup, less complexity?',
        required: false,
      },
    ],
  },

  {
    id: 'constraints',
    title: 'Your training schedule',
    subtitle: 'Real life shapes your training. Let\'s understand what you\'re actually working with.',
    questions: [
      {
        key: 'realistic_training_days',
        type: 'single_select',
        label: 'How many days per week can you realistically commit to training?',
        required: false,
        options: [
          { value: '2', label: '2 days' },
          { value: '3', label: '3 days' },
          { value: '4', label: '4 days' },
          { value: '5', label: '5 days' },
          { value: '6', label: '6–7 days' },
        ],
      },
      {
        key: 'can_do_long_weekends',
        type: 'boolean',
        label: 'Can you regularly dedicate 3–5 hours to a long run or hike at the weekend?',
        required: false,
      },
      {
        key: 'biggest_constraint',
        type: 'single_select',
        label: 'Which constraint most limits your training and race choices?',
        required: false,
        options: [
          { value: 'time', label: 'Time — work, family, other commitments' },
          { value: 'budget', label: 'Budget — I need to keep costs down' },
          { value: 'terrain', label: 'Terrain access — flat or urban area' },
          { value: 'heat', label: 'Heat access — I can\'t train in hot conditions' },
          { value: 'recovery', label: 'Recovery — injury history or limited recovery capacity' },
          { value: 'family', label: 'Family or travel commitment — hard to be away long' },
        ],
      },
    ],
  },

  {
    id: 'goals',
    title: 'Your goals and MDS ambitions',
    subtitle: 'Finally — what are you actually working toward?',
    questions: [
      {
        key: 'next_race_ambition',
        type: 'single_select',
        label: 'What are you looking for from your next race?',
        required: false,
        options: [
          { value: 'safest', label: 'Safest next step — build confidence without risking failure' },
          { value: 'balanced', label: 'Balanced challenge — push myself but stay realistic' },
          { value: 'stretch', label: 'Stretch challenge — I want to test myself hard' },
        ],
      },
      {
        key: 'most_appealing_quality',
        type: 'single_select',
        label: 'Which of these sounds most appealing for your next race?',
        required: false,
        options: [
          { value: 'confidence', label: 'A race that builds my confidence and sets me up well' },
          { value: 'stage_experience', label: 'A multi-stage experience — learning to race day after day' },
          { value: 'desert', label: 'A desert race — getting proper sand and heat under my belt' },
          { value: 'endurance', label: 'An endurance test — extending my distance or time on feet' },
          { value: 'self_sufficiency', label: 'A self-sufficiency challenge — pack carrying, kit management' },
        ],
      },
      {
        key: 'targeting_mds',
        type: 'boolean',
        label: 'Are you specifically working toward Marathon des Sables?',
        required: false,
      },
      {
        key: 'mds_timeline',
        type: 'single_select',
        label: 'How soon are you hoping to do MDS (or a major desert stage race)?',
        required: false,
        options: [
          { value: 'within_12m', label: 'Within the next 12 months' },
          { value: '12_24m', label: 'In 12–24 months' },
          { value: '2_plus_years', label: 'In 2+ years — I\'m building toward it steadily' },
          { value: 'exploring', label: 'I\'m just exploring — no specific timeline yet' },
        ],
      },
      {
        key: 'most_needed_from_next_race',
        type: 'single_select',
        label: 'What do you most need your next race to give you?',
        required: false,
        options: [
          { value: 'confidence', label: 'Confidence — proof I can do this' },
          { value: 'stage_racing', label: 'Stage race experience — racing across multiple days' },
          { value: 'heat_management', label: 'Heat management — tested in real conditions' },
          { value: 'endurance', label: 'More endurance — covering bigger distances' },
          { value: 'pack_carrying', label: 'Pack carrying — experience with loaded kit' },
          { value: 'understand_desert', label: 'Desert understanding — is this for me?' },
        ],
      },
    ],
  },
];

// Total question count for progress calculation
export const TOTAL_QUESTIONS = ASSESSMENT_SECTIONS.reduce(
  (sum, s) => sum + s.questions.length,
  0
);
