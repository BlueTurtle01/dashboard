/**
 * Contextual explanations for race segment training tags.
 * Explains what each segment tag means for race demands and how the plan addresses it.
 */

export type SegmentExplanation = {
  displayName: string;
  courseContext: string;
  trainingRationale: string;
};

export const SEGMENT_EXPLANATIONS: Record<string, SegmentExplanation> = {
  "hill-climbing": {
    displayName: "Hill Climbing",
    courseContext:
      "This section involves sustained ascent that tests leg strength, cardiovascular capacity, and climbing efficiency.",
    trainingRationale:
      "Your coach has prescribed progressive elevation sessions to build slow-twitch muscle endurance and develop an efficient uphill running rhythm. These sessions develop the leg strength and aerobic capacity needed to maintain pace on climbs.",
  },

  "descent-control": {
    displayName: "Descent Control",
    courseContext:
      "This section requires careful downhill running technique to maintain speed while protecting your legs from impact stress.",
    trainingRationale:
      "Your coach has included trail and technical terrain sessions to build confidence and leg control on descents. Key sessions focus on foot placement, balance, and eccentric strength to handle sustained downhill running safely.",
  },

  "technical-terrain": {
    displayName: "Technical Terrain",
    courseContext:
      "This section has rough, uneven ground that demands attention to foot placement, balance, and agility.",
    trainingRationale:
      "Your coach has programmed trail running and technical session work to sharpen your proprioception and footwork. These build the neuromuscular control needed to run efficiently over challenging terrain while minimizing injury risk.",
  },

  "heat-tolerance": {
    displayName: "Heat Tolerance",
    courseContext:
      "This section is expected to be hot, requiring effective thermoregulation and heat management to maintain performance.",
    trainingRationale:
      "Your coach has included heat-adapted training sessions to improve your body's ability to dissipate heat and maintain pace in warm conditions. Exposure to heat stress training enhances sweat response and cardiovascular stability.",
  },

  "altitude": {
    displayName: "Altitude",
    courseContext:
      "This section is at elevation where reduced oxygen availability demands aerobic adaptation.",
    trainingRationale:
      "Your coach has structured sessions to build your aerobic base and teach your body to work efficiently at lower oxygen levels. This adaptation improves your ability to maintain effort without feeling severely oxygen-limited.",
  },

  "pack-carrying": {
    displayName: "Pack Carrying",
    courseContext:
      "This section requires sustained running while carrying a loaded pack, adding significant weight stress and balance demands.",
    trainingRationale:
      "Your coach has included loaded running sessions and strength work to build the muscle endurance needed to carry weight efficiently. These sessions develop stability, posture control, and the specific strength demands of load carriage.",
  },

  "sand-running": {
    displayName: "Sand Running",
    courseContext:
      "This section involves running on sand or loose surface, which requires greater energy expenditure and different biomechanics.",
    trainingRationale:
      "Your coach has prescribed soft-surface and sand-specific sessions to adapt your leg muscles to the unique demands of sand running. This reduces the shock of race day and develops the specific strength patterns needed for efficient sand running.",
  },

  "self-sufficiency": {
    displayName: "Self-Sufficiency",
    courseContext:
      "This section requires you to be self-sufficient — managing your own nutrition, hydration, navigation, or other essentials without external support.",
    trainingRationale:
      "Your coach has combined navigation and self-sufficient running sessions to build confidence and systems for running independently. These sessions teach time management, decision-making, and self-pacing without crew support.",
  },

  "navigation": {
    displayName: "Navigation",
    courseContext:
      "This section requires map reading, route finding, or navigating without marked trails — demanding focus and decision-making.",
    trainingRationale:
      "Your coach has included navigation-specific sessions to train your route-finding skills and build confidence with maps. These sessions develop the mental focus and calmness needed to navigate effectively during the race.",
  },

  "multi-stage-fatigue": {
    displayName: "Multi-Stage Fatigue",
    courseContext:
      "This race spans multiple stages or days, requiring you to manage fatigue across consecutive hard efforts.",
    trainingRationale:
      "Your coach has structured back-to-back training blocks with consecutive hard sessions to teach your body to recover between efforts and maintain performance when fatigued. This builds the mental resilience and physiological adaptations needed for multi-day racing.",
  },

  "strength-endurance": {
    displayName: "Strength & Endurance",
    courseContext:
      "This section demands sustained powerful effort — climbing, carrying, or maintaining pace on challenging terrain — requiring strength and muscular endurance.",
    trainingRationale:
      "Your coach has programmed gym sessions and strength-focused running work to build muscular endurance and power. This combination develops the raw strength needed to power through demanding sections while maintaining efficient running form.",
  },

  "mental-resilience": {
    displayName: "Mental Resilience",
    courseContext:
      "This race is mentally challenging — whether through distance, duration, difficulty, or discomfort — and requires mental toughness.",
    trainingRationale:
      "Your coach has programmed longer sessions and challenging peak-phase work to build mental resilience and self-belief. These sessions teach you to push through discomfort, stay composed under stress, and trust your training when things get hard.",
  },
};
