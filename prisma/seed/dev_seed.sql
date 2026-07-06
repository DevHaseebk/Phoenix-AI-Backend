-- DEVELOPMENT ONLY
-- DO NOT RUN IN PRODUCTION
-- Run manually in Supabase SQL Editor.
-- This script bypasses API validation and is only for demo/testing data.
--
-- Demo login credentials:
--   email: demo1@example.com
--   password: Password123!
--
--   email: demo2@example.com
--   password: Password123!
--
--   email: demo3@example.com
--   password: Password123!
--
-- Notes:
-- - Password hashes below are real Argon2id hashes for Password123!.
-- - IDs are fixed so this script is idempotent.
-- - Only currently implemented demo tables are seeded.
-- - Unimplemented modules such as MealLog, Dashboard, AI, WhatsApp, and Admin are intentionally not seeded.

BEGIN;

INSERT INTO "users" (
  "id",
  "email",
  "passwordHash",
  "fullName",
  "phone",
  "status",
  "emailVerifiedAt",
  "phoneVerifiedAt",
  "lastActiveAt",
  "deletedAt",
  "createdAt",
  "updatedAt"
) VALUES
(
  '11111111-1111-4111-8111-111111111111',
  'demo1@example.com',
  '$argon2id$v=19$m=65536,t=3,p=4$/5k6gdykKIxWOLk0cvqw1w$hobO45VGci6MNIhUc87voaAJnkEj1vmPQ9w3MHpgY38',
  'Haseeb Demo',
  '+15550000001',
  'ACTIVE'::"UserStatus",
  TIMESTAMP '2026-07-01 08:00:00.000',
  NULL,
  TIMESTAMP '2026-07-06 08:45:00.000',
  NULL,
  TIMESTAMP '2026-07-01 08:00:00.000',
  TIMESTAMP '2026-07-06 08:45:00.000'
),
(
  '22222222-2222-4222-8222-222222222222',
  'demo2@example.com',
  '$argon2id$v=19$m=65536,t=3,p=4$mPn4ye5Ate7NvJ18sGiOBg$bzwnhqnHYzc3190hEF8Zdd2Fx/xpTWNtHybF9s+XvQo',
  'Ayesha Demo',
  '+15550000002',
  'ACTIVE'::"UserStatus",
  TIMESTAMP '2026-07-01 09:00:00.000',
  NULL,
  TIMESTAMP '2026-07-06 09:20:00.000',
  NULL,
  TIMESTAMP '2026-07-01 09:00:00.000',
  TIMESTAMP '2026-07-06 09:20:00.000'
),
(
  '33333333-3333-4333-8333-333333333333',
  'demo3@example.com',
  '$argon2id$v=19$m=65536,t=3,p=4$w49LwfgDUIJiDTKNKD7beQ$zPGdGctHxFBLurDRyfopTdanjeEnz9JytS4roPhOHj8',
  'Bilal Demo',
  '+15550000003',
  'ACTIVE'::"UserStatus",
  TIMESTAMP '2026-07-01 10:00:00.000',
  NULL,
  TIMESTAMP '2026-07-06 10:10:00.000',
  NULL,
  TIMESTAMP '2026-07-01 10:00:00.000',
  TIMESTAMP '2026-07-06 10:10:00.000'
)
ON CONFLICT ("id") DO UPDATE SET
  "email" = EXCLUDED."email",
  "passwordHash" = EXCLUDED."passwordHash",
  "fullName" = EXCLUDED."fullName",
  "phone" = EXCLUDED."phone",
  "status" = EXCLUDED."status",
  "emailVerifiedAt" = EXCLUDED."emailVerifiedAt",
  "phoneVerifiedAt" = EXCLUDED."phoneVerifiedAt",
  "lastActiveAt" = EXCLUDED."lastActiveAt",
  "deletedAt" = EXCLUDED."deletedAt",
  "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO "user_profiles" (
  "id",
  "userId",
  "gender",
  "dateOfBirth",
  "heightCm",
  "currentWeightKg",
  "targetWeightKg",
  "goalType",
  "goalPace",
  "activityLevel",
  "timezone",
  "preferredLanguage",
  "calorieTarget",
  "proteinTargetGrams",
  "createdAt",
  "updatedAt"
) VALUES
(
  '11111111-aaaa-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'MALE'::"Gender",
  TIMESTAMP '1998-01-01 00:00:00.000',
  188.0,
  149.8,
  100.0,
  'LOSE_WEIGHT'::"GoalType",
  'BALANCED'::"GoalPace",
  'SEDENTARY'::"ActivityLevel",
  'Asia/Karachi',
  'en',
  2200,
  160,
  TIMESTAMP '2026-07-01 08:05:00.000',
  TIMESTAMP '2026-07-06 08:30:00.000'
),
(
  '22222222-aaaa-4222-8222-222222222222',
  '22222222-2222-4222-8222-222222222222',
  'FEMALE'::"Gender",
  TIMESTAMP '1994-04-12 00:00:00.000',
  164.0,
  82.4,
  68.0,
  'LOSE_WEIGHT'::"GoalType",
  'SLOW'::"GoalPace",
  'LIGHTLY_ACTIVE'::"ActivityLevel",
  'Asia/Karachi',
  'en',
  1750,
  105,
  TIMESTAMP '2026-07-01 09:05:00.000',
  TIMESTAMP '2026-07-06 09:10:00.000'
),
(
  '33333333-aaaa-4333-8333-333333333333',
  '33333333-3333-4333-8333-333333333333',
  'MALE'::"Gender",
  TIMESTAMP '1990-09-20 00:00:00.000',
  176.0,
  76.5,
  76.0,
  'MAINTAIN_WEIGHT'::"GoalType",
  'BALANCED'::"GoalPace",
  'MODERATELY_ACTIVE'::"ActivityLevel",
  'Asia/Karachi',
  'en',
  2450,
  125,
  TIMESTAMP '2026-07-01 10:05:00.000',
  TIMESTAMP '2026-07-06 10:05:00.000'
)
ON CONFLICT ("id") DO UPDATE SET
  "userId" = EXCLUDED."userId",
  "gender" = EXCLUDED."gender",
  "dateOfBirth" = EXCLUDED."dateOfBirth",
  "heightCm" = EXCLUDED."heightCm",
  "currentWeightKg" = EXCLUDED."currentWeightKg",
  "targetWeightKg" = EXCLUDED."targetWeightKg",
  "goalType" = EXCLUDED."goalType",
  "goalPace" = EXCLUDED."goalPace",
  "activityLevel" = EXCLUDED."activityLevel",
  "timezone" = EXCLUDED."timezone",
  "preferredLanguage" = EXCLUDED."preferredLanguage",
  "calorieTarget" = EXCLUDED."calorieTarget",
  "proteinTargetGrams" = EXCLUDED."proteinTargetGrams",
  "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO "user_onboarding" (
  "id",
  "userId",
  "status",
  "currentStep",
  "completedSteps",
  "draft",
  "completedAt",
  "createdAt",
  "updatedAt"
) VALUES
(
  '11111111-bbbb-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'COMPLETED'::"OnboardingStatus",
  NULL,
  '["WELCOME", "GOAL", "BASIC_INFO", "ACTIVITY_LEVEL", "FOOD"]'::jsonb,
  '{"completedInput":{"gender":"MALE","heightCm":188,"currentWeightKg":150,"targetWeightKg":100,"goalType":"LOSE_WEIGHT","goalPace":"BALANCED","activityLevel":"SEDENTARY"},"calculatedTargets":{"calorieTarget":2200,"proteinTargetGrams":160}}'::jsonb,
  TIMESTAMP '2026-07-01 08:10:00.000',
  TIMESTAMP '2026-07-01 08:05:00.000',
  TIMESTAMP '2026-07-01 08:10:00.000'
),
(
  '22222222-bbbb-4222-8222-222222222222',
  '22222222-2222-4222-8222-222222222222',
  'COMPLETED'::"OnboardingStatus",
  NULL,
  '["WELCOME", "GOAL", "BASIC_INFO", "ACTIVITY_LEVEL", "FOOD"]'::jsonb,
  '{"completedInput":{"gender":"FEMALE","heightCm":164,"currentWeightKg":83,"targetWeightKg":68,"goalType":"LOSE_WEIGHT","goalPace":"SLOW","activityLevel":"LIGHTLY_ACTIVE"},"calculatedTargets":{"calorieTarget":1750,"proteinTargetGrams":105}}'::jsonb,
  TIMESTAMP '2026-07-01 09:10:00.000',
  TIMESTAMP '2026-07-01 09:05:00.000',
  TIMESTAMP '2026-07-01 09:10:00.000'
),
(
  '33333333-bbbb-4333-8333-333333333333',
  '33333333-3333-4333-8333-333333333333',
  'COMPLETED'::"OnboardingStatus",
  NULL,
  '["WELCOME", "GOAL", "BASIC_INFO", "ACTIVITY_LEVEL", "FOOD"]'::jsonb,
  '{"completedInput":{"gender":"MALE","heightCm":176,"currentWeightKg":77,"targetWeightKg":76,"goalType":"MAINTAIN_WEIGHT","goalPace":"BALANCED","activityLevel":"MODERATELY_ACTIVE"},"calculatedTargets":{"calorieTarget":2450,"proteinTargetGrams":125}}'::jsonb,
  TIMESTAMP '2026-07-01 10:10:00.000',
  TIMESTAMP '2026-07-01 10:05:00.000',
  TIMESTAMP '2026-07-01 10:10:00.000'
)
ON CONFLICT ("id") DO UPDATE SET
  "userId" = EXCLUDED."userId",
  "status" = EXCLUDED."status",
  "currentStep" = EXCLUDED."currentStep",
  "completedSteps" = EXCLUDED."completedSteps",
  "draft" = EXCLUDED."draft",
  "completedAt" = EXCLUDED."completedAt",
  "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO "weight_logs" (
  "id",
  "userId",
  "weightKg",
  "loggedAt",
  "source",
  "note",
  "createdAt",
  "updatedAt"
) VALUES
('11111111-c001-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 151.2, TIMESTAMP '2026-07-02 07:30:00.000', 'ONBOARDING'::"WeightLogSource", 'Starting weigh-in', TIMESTAMP '2026-07-02 07:30:00.000', TIMESTAMP '2026-07-02 07:30:00.000'),
('11111111-c002-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 150.4, TIMESTAMP '2026-07-04 07:45:00.000', 'MANUAL'::"WeightLogSource", 'After morning walk', TIMESTAMP '2026-07-04 07:45:00.000', TIMESTAMP '2026-07-04 07:45:00.000'),
('11111111-c003-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 149.8, TIMESTAMP '2026-07-06 08:00:00.000', 'MANUAL'::"WeightLogSource", 'Steady progress', TIMESTAMP '2026-07-06 08:00:00.000', TIMESTAMP '2026-07-06 08:00:00.000'),
('22222222-c001-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 83.0, TIMESTAMP '2026-07-02 08:10:00.000', 'ONBOARDING'::"WeightLogSource", 'Initial log', TIMESTAMP '2026-07-02 08:10:00.000', TIMESTAMP '2026-07-02 08:10:00.000'),
('22222222-c002-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 82.7, TIMESTAMP '2026-07-04 08:20:00.000', 'MANUAL'::"WeightLogSource", 'Morning check', TIMESTAMP '2026-07-04 08:20:00.000', TIMESTAMP '2026-07-04 08:20:00.000'),
('22222222-c003-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 82.4, TIMESTAMP '2026-07-06 08:30:00.000', 'MANUAL'::"WeightLogSource", 'Light breakfast day', TIMESTAMP '2026-07-06 08:30:00.000', TIMESTAMP '2026-07-06 08:30:00.000'),
('33333333-c001-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 76.9, TIMESTAMP '2026-07-02 07:55:00.000', 'ONBOARDING'::"WeightLogSource", 'Baseline', TIMESTAMP '2026-07-02 07:55:00.000', TIMESTAMP '2026-07-02 07:55:00.000'),
('33333333-c002-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 76.7, TIMESTAMP '2026-07-04 08:05:00.000', 'MANUAL'::"WeightLogSource", 'Post workout', TIMESTAMP '2026-07-04 08:05:00.000', TIMESTAMP '2026-07-04 08:05:00.000'),
('33333333-c003-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 76.5, TIMESTAMP '2026-07-06 08:15:00.000', 'MANUAL'::"WeightLogSource", 'Maintenance trend', TIMESTAMP '2026-07-06 08:15:00.000', TIMESTAMP '2026-07-06 08:15:00.000')
ON CONFLICT ("id") DO UPDATE SET
  "userId" = EXCLUDED."userId",
  "weightKg" = EXCLUDED."weightKg",
  "loggedAt" = EXCLUDED."loggedAt",
  "source" = EXCLUDED."source",
  "note" = EXCLUDED."note",
  "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO "water_logs" (
  "id",
  "userId",
  "amountMl",
  "loggedAt",
  "source",
  "note",
  "createdAt",
  "updatedAt"
) VALUES
('11111111-d001-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 500, TIMESTAMP '2026-07-06 08:30:00.000', 'QUICK_ADD'::"WaterLogSource", 'Morning bottle', TIMESTAMP '2026-07-06 08:30:00.000', TIMESTAMP '2026-07-06 08:30:00.000'),
('11111111-d002-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 750, TIMESTAMP '2026-07-06 12:45:00.000', 'MANUAL'::"WaterLogSource", 'With lunch', TIMESTAMP '2026-07-06 12:45:00.000', TIMESTAMP '2026-07-06 12:45:00.000'),
('11111111-d003-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 500, TIMESTAMP '2026-07-06 17:10:00.000', 'QUICK_ADD'::"WaterLogSource", 'Evening glass', TIMESTAMP '2026-07-06 17:10:00.000', TIMESTAMP '2026-07-06 17:10:00.000'),
('22222222-d001-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 250, TIMESTAMP '2026-07-06 09:00:00.000', 'QUICK_ADD'::"WaterLogSource", 'After tea', TIMESTAMP '2026-07-06 09:00:00.000', TIMESTAMP '2026-07-06 09:00:00.000'),
('22222222-d002-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 500, TIMESTAMP '2026-07-06 13:30:00.000', 'MANUAL'::"WaterLogSource", 'Lunch water', TIMESTAMP '2026-07-06 13:30:00.000', TIMESTAMP '2026-07-06 13:30:00.000'),
('22222222-d003-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 500, TIMESTAMP '2026-07-06 18:20:00.000', 'QUICK_ADD'::"WaterLogSource", 'Evening refill', TIMESTAMP '2026-07-06 18:20:00.000', TIMESTAMP '2026-07-06 18:20:00.000'),
('33333333-d001-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 750, TIMESTAMP '2026-07-06 08:40:00.000', 'MANUAL'::"WaterLogSource", 'Gym bottle', TIMESTAMP '2026-07-06 08:40:00.000', TIMESTAMP '2026-07-06 08:40:00.000'),
('33333333-d002-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 500, TIMESTAMP '2026-07-06 14:00:00.000', 'QUICK_ADD'::"WaterLogSource", 'Afternoon water', TIMESTAMP '2026-07-06 14:00:00.000', TIMESTAMP '2026-07-06 14:00:00.000'),
('33333333-d003-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 750, TIMESTAMP '2026-07-06 19:30:00.000', 'MANUAL'::"WaterLogSource", 'Dinner water', TIMESTAMP '2026-07-06 19:30:00.000', TIMESTAMP '2026-07-06 19:30:00.000')
ON CONFLICT ("id") DO UPDATE SET
  "userId" = EXCLUDED."userId",
  "amountMl" = EXCLUDED."amountMl",
  "loggedAt" = EXCLUDED."loggedAt",
  "source" = EXCLUDED."source",
  "note" = EXCLUDED."note",
  "updatedAt" = EXCLUDED."updatedAt";

INSERT INTO "exercise_logs" (
  "id",
  "userId",
  "exerciseType",
  "durationMinutes",
  "steps",
  "distanceKm",
  "estimatedCaloriesBurned",
  "loggedAt",
  "source",
  "note",
  "createdAt",
  "updatedAt"
) VALUES
('11111111-e001-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'WALKING'::"ExerciseType", 25, 3200, 2.4, 180, TIMESTAMP '2026-07-04 18:30:00.000', 'MANUAL'::"ExerciseLogSource", 'Evening walk', TIMESTAMP '2026-07-04 18:30:00.000', TIMESTAMP '2026-07-04 18:30:00.000'),
('11111111-e002-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'STEPS'::"ExerciseType", 45, 6100, NULL, 260, TIMESTAMP '2026-07-05 21:00:00.000', 'DEVICE'::"ExerciseLogSource", 'Daily steps import', TIMESTAMP '2026-07-05 21:00:00.000', TIMESTAMP '2026-07-05 21:00:00.000'),
('11111111-e003-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'CARDIO'::"ExerciseType", 20, NULL, NULL, 210, TIMESTAMP '2026-07-06 19:00:00.000', 'MANUAL'::"ExerciseLogSource", 'Stationary bike', TIMESTAMP '2026-07-06 19:00:00.000', TIMESTAMP '2026-07-06 19:00:00.000'),
('22222222-e001-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'WALKING'::"ExerciseType", 20, 2500, 1.8, 120, TIMESTAMP '2026-07-04 07:30:00.000', 'MANUAL'::"ExerciseLogSource", 'Morning walk', TIMESTAMP '2026-07-04 07:30:00.000', TIMESTAMP '2026-07-04 07:30:00.000'),
('22222222-e002-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'OTHER'::"ExerciseType", 30, NULL, NULL, 90, TIMESTAMP '2026-07-05 18:00:00.000', 'MANUAL'::"ExerciseLogSource", 'Mobility session', TIMESTAMP '2026-07-05 18:00:00.000', TIMESTAMP '2026-07-05 18:00:00.000'),
('22222222-e003-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 'STEPS'::"ExerciseType", 40, 5200, NULL, 210, TIMESTAMP '2026-07-06 20:30:00.000', 'DEVICE'::"ExerciseLogSource", 'Steps from watch', TIMESTAMP '2026-07-06 20:30:00.000', TIMESTAMP '2026-07-06 20:30:00.000'),
('33333333-e001-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 'RUNNING'::"ExerciseType", 30, 4800, 4.0, 330, TIMESTAMP '2026-07-04 06:45:00.000', 'MANUAL'::"ExerciseLogSource", 'Easy run', TIMESTAMP '2026-07-04 06:45:00.000', TIMESTAMP '2026-07-04 06:45:00.000'),
('33333333-e002-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 'STRENGTH'::"ExerciseType", 45, NULL, NULL, 250, TIMESTAMP '2026-07-05 17:45:00.000', 'MANUAL'::"ExerciseLogSource", 'Upper body strength', TIMESTAMP '2026-07-05 17:45:00.000', TIMESTAMP '2026-07-05 17:45:00.000'),
('33333333-e003-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 'CYCLING'::"ExerciseType", 35, NULL, 10.5, 290, TIMESTAMP '2026-07-06 18:15:00.000', 'MANUAL'::"ExerciseLogSource", 'Neighborhood ride', TIMESTAMP '2026-07-06 18:15:00.000', TIMESTAMP '2026-07-06 18:15:00.000')
ON CONFLICT ("id") DO UPDATE SET
  "userId" = EXCLUDED."userId",
  "exerciseType" = EXCLUDED."exerciseType",
  "durationMinutes" = EXCLUDED."durationMinutes",
  "steps" = EXCLUDED."steps",
  "distanceKm" = EXCLUDED."distanceKm",
  "estimatedCaloriesBurned" = EXCLUDED."estimatedCaloriesBurned",
  "loggedAt" = EXCLUDED."loggedAt",
  "source" = EXCLUDED."source",
  "note" = EXCLUDED."note",
  "updatedAt" = EXCLUDED."updatedAt";

COMMIT;
