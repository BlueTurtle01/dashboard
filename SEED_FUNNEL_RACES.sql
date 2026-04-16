-- =========================================================
-- SEED: Funnel Races
-- Feeder race database for the MDS Readiness Funnel
-- Run AFTER SETUP_FUNNEL.sql
-- Idempotent: uses ON CONFLICT DO NOTHING
-- =========================================================

INSERT INTO public.funnel_races (
  name, slug, organiser, website_url, country, region, continent,
  typical_month, is_stage_race, is_single_stage, is_desert_race,
  stage_count, total_distance_km, longest_stage_km,
  terrain_tags, surface_tags,
  technicality_level, hilliness_level, heat_level, humidity_level,
  self_sufficiency_level, pack_requirement_level,
  logistics_complexity_level, travel_difficulty_level,
  suitable_after_marathon_level, suitable_as_final_step_before_mds_level,
  min_background_level, estimated_entry_cost_gbp, estimated_total_cost_gbp, notes
) VALUES

-- -------------------------------------------------------
-- DESERT / SELF-SUPPORTED STAGE RACES (closest to MDS)
-- -------------------------------------------------------

(
  'Sahara Race Egypt', 'sahara-race-egypt',
  '4 Deserts', NULL,
  'Egypt', 'Sahara', 'Africa',
  10, true, false, true, 6, 250, 80,
  '{desert,sand,rocky,dune}', '{sand,gravel,rock}',
  2, 2, 5, 2, 5, 5, 4, 4,
  2, 5, 3, 1500, 3800,
  'Self-supported 6-stage desert race across the Egyptian Sahara. Very high heat, significant sand and pack carry. One of the best MDS simulations available.'
),

(
  'Gobi March', 'gobi-march',
  '4 Deserts', NULL,
  'China', 'Gobi Desert', 'Asia',
  6, true, false, true, 6, 250, 80,
  '{desert,sand,steppe,rocky}', '{sand,gravel,rock}',
  2, 2, 4, 1, 5, 5, 4, 5,
  2, 5, 3, 1500, 4200,
  'Self-supported 6-stage desert race across the Gobi. Slightly less extreme heat than the Sahara or Atacama. Excellent multi-day and pack-carry preparation.'
),

(
  'Atacama Crossing', 'atacama-crossing',
  '4 Deserts', NULL,
  'Chile', 'Atacama Desert', 'South America',
  3, true, false, true, 6, 250, 80,
  '{desert,salt_flat,volcanic,rocky}', '{sand,salt,rock,gravel}',
  3, 3, 4, 1, 5, 5, 4, 5,
  2, 5, 3, 1500, 4800,
  'Driest desert on Earth with moderate altitude (2,400m+). High scenery, challenging pack carry. Brilliant MDS preparation — tougher logistically due to Chile travel.'
),

(
  'Namib Race', 'namib-race',
  '4 Deserts', NULL,
  'Namibia', 'Namib Desert', 'Africa',
  9, true, false, true, 6, 250, 80,
  '{desert,sand,dune,rocky}', '{sand,gravel,rock}',
  2, 2, 4, 2, 5, 5, 4, 4,
  2, 5, 3, 1500, 4200,
  'Self-supported 6-stage race in one of the world''s oldest deserts. Sand dunes, gravel plains, rocky terrain. Strong MDS simulation — Namibia is very accessible from the UK.'
),

(
  'Ultra X Jordan', 'ultra-x-jordan',
  'Ultra X', NULL,
  'Jordan', 'Wadi Rum', 'Asia',
  4, true, false, true, 5, 250, 60,
  '{desert,sand,wadi,rocky}', '{sand,rock,gravel}',
  2, 2, 4, 1, 5, 5, 3, 3,
  3, 5, 3, 1400, 3200,
  'Self-supported 5-stage desert race in the stunning Wadi Rum. Great MDS prep at a more accessible price than the 4 Deserts series. Shorter travel, good heat, desert terrain.'
),

(
  'Kasbah Trail Morocco', 'kasbah-trail-morocco',
  'Kasbah Trail', NULL,
  'Morocco', 'Sahara', 'Africa',
  4, true, false, true, 6, 250, 80,
  '{desert,sand,wadi,kasbahs}', '{sand,gravel,rock}',
  2, 2, 4, 1, 5, 5, 3, 3,
  3, 5, 2, 1000, 2600,
  'Self-supported 6-stage race in Morocco — the same country as MDS. Closest environmental match available. Lower profile but excellent desert preparation at a more accessible price.'
),

-- -------------------------------------------------------
-- DESERT / SINGLE-STAGE (good intro to desert running)
-- -------------------------------------------------------

(
  'Wadi Rum Ultra', 'wadi-rum-ultra',
  'Ultra X', NULL,
  'Jordan', 'Wadi Rum', 'Asia',
  10, false, true, true, 1, 50, 50,
  '{desert,sand,rocky}', '{sand,rock}',
  2, 2, 4, 1, 2, 2, 3, 3,
  4, 3, 2, 350, 1200,
  'Single-stage 50k desert ultra in the iconic Wadi Rum. Excellent, accessible entry point to desert racing. Lower commitment and cost — a natural first step for runners with marathon background.'
),

(
  'Oman Desert Marathon', 'oman-desert-marathon',
  'Oman Desert Marathon', NULL,
  'Oman', 'Wahiba Sands', 'Asia',
  11, false, true, true, 1, 42, 42,
  '{desert,sand,dune}', '{sand,gravel}',
  2, 2, 4, 2, 2, 1, 3, 3,
  5, 3, 2, 300, 1000,
  'Road-friendly runners'' first desert marathon experience on sand dunes in Oman. Very accessible introduction. Good heat and sand exposure but minimal multi-stage or pack experience.'
),

-- -------------------------------------------------------
-- TRAIL / MOUNTAIN ULTRAS (endurance and terrain development)
-- -------------------------------------------------------

(
  'Comrades Marathon', 'comrades-marathon',
  'Comrades', NULL,
  'South Africa', 'KwaZulu-Natal', 'Africa',
  6, false, true, false, 1, 89, 89,
  '{road,hilly}', '{tarmac}',
  1, 4, 2, 3, 1, 1, 2, 3,
  5, 2, 2, 180, 1200,
  'Iconic 89k road ultra. One of the world''s great ultra-running events. Excellent endurance stepping stone from marathon. Limited specificity for desert or stage racing, but superb base-building.'
),

(
  'Trans Gran Canaria', 'trans-gran-canaria',
  'Trans Gran Canaria', NULL,
  'Spain', 'Canary Islands', 'Europe',
  2, false, true, false, 1, 128, 128,
  '{mountain,trail,volcanic,coastal}', '{rock,trail,gravel}',
  4, 5, 3, 3, 2, 1, 2, 2,
  2, 2, 3, 200, 900,
  'Mountain trail race in the Canary Islands. Volcanic terrain, good trail and heat exposure, very accessible from the UK. A solid ultra stepping stone but no stage-race or desert preparation.'
),

(
  'Lavaredo Ultra Trail', 'lavaredo-ultra-trail',
  'Lavaredo', NULL,
  'Italy', 'Dolomites', 'Europe',
  6, false, true, false, 1, 120, 120,
  '{mountain,trail,technical}', '{rock,trail,scree}',
  5, 5, 2, 2, 2, 1, 2, 2,
  1, 2, 3, 250, 1000,
  'World-class 120k race in the Dolomites. Technically demanding, beautiful, but cold and mountainous — no desert relevance. Suitable only for experienced trail runners.'
),

(
  'Oman by UTMB', 'oman-by-utmb',
  'UTMB', NULL,
  'Oman', 'Musandam', 'Asia',
  1, false, true, false, 1, 137, 137,
  '{mountain,coastal,trail,rocky}', '{rock,gravel,trail}',
  4, 5, 4, 2, 2, 1, 3, 3,
  2, 3, 3, 600, 1900,
  '137k mountain trail race in Oman with significant heat exposure. Good combination of heat and trail challenge. Demanding — best suited for experienced trail runners seeking MDS-adjacent conditioning.'
),

-- -------------------------------------------------------
-- MULTI-STAGE TRAIL RACES (stage-race experience, less desert)
-- -------------------------------------------------------

(
  'Dragon''s Back Race', 'dragons-back-race',
  'GB Ultras', NULL,
  'United Kingdom', 'Wales', 'Europe',
  9, true, false, false, 5, 380, 100,
  '{mountain,trail,technical,boggy}', '{grass,rock,peat}',
  5, 5, 1, 4, 3, 2, 3, 1,
  1, 3, 4, 1200, 2600,
  'Legendary 5-day mountain race along the spine of Wales. Builds extraordinary multi-day resilience and navigational skill. No desert relevance, but a powerful stage-race experience for UK-based athletes.'
),

(
  'Jungle Ultra Peru', 'jungle-ultra-peru',
  'Beyond the Ultimate', NULL,
  'Peru', 'Amazon', 'South America',
  5, true, false, false, 5, 230, 67,
  '{jungle,trail,technical,river}', '{mud,root,sand,river}',
  5, 4, 3, 5, 5, 5, 4, 5,
  1, 2, 3, 2000, 5200,
  'Extreme 5-stage jungle ultra in the Amazon. Develops remarkable multi-day toughness and self-sufficiency but is very different from desert racing. High humidity, technical terrain, significant travel.'
),

(
  'Coastal Challenge Costa Rica', 'coastal-challenge-costa-rica',
  'Coastal Challenge', NULL,
  'Costa Rica', 'Pacific Coast', 'North America',
  2, true, false, false, 6, 236, 51,
  '{jungle,beach,trail,technical}', '{sand,mud,trail,river}',
  4, 4, 3, 5, 3, 3, 4, 5,
  1, 2, 3, 2500, 6200,
  'Stunning 6-stage beach-and-jungle race in Costa Rica. Very scenic but one of the world''s most expensive races. Builds multi-stage experience in a very different environment to MDS.'
),

-- -------------------------------------------------------
-- THE TARGET EVENT (reference only, not a recommendation)
-- -------------------------------------------------------

(
  'Marathon des Sables', 'marathon-des-sables',
  'MaraSab', NULL,
  'Morocco', 'Sahara', 'Africa',
  4, true, false, true, 6, 250, 91,
  '{desert,sand,dune,rocky,erg}', '{sand,gravel,rock}',
  2, 2, 5, 1, 5, 5, 4, 3,
  1, 5, 4, 2200, 5200,
  'THE target event. Listed for reference only — this is the race athletes are working toward. Not recommended as a feeder race for itself.'
)

ON CONFLICT (slug) DO NOTHING;
