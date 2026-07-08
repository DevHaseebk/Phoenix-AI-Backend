/**
 * Placeholder RAG knowledge documents for DailyFit Coach.
 *
 * All documents are seeded with status DRAFT: the founder must review and
 * approve them before they are considered production knowledge. Tone follows
 * the Project Constitution: professional friend, no shame, no fake certainty.
 */

export interface RagSeedDocument {
  category:
    | 'PAKISTANI_FOODS'
    | 'PLATEAU_HANDLING'
    | 'WALKING_GUIDE'
    | 'PROTEIN_GUIDE'
    | 'BEHAVIOR_RULES'
    | 'RAMADAN_GUIDE'
    | 'SAFETY_BOUNDARIES'
    | 'FLEXIBLE_MEALS'
    | 'RESTAURANT_NOTES';
  title: string;
  content: string;
}

export const ragSeedDocuments: RagSeedDocument[] = [
  {
    category: 'PAKISTANI_FOODS',
    title: 'Pakistani Everyday Foods: Calorie and Portion Basics',
    content: `
Pakistani home cooking is built around roti, rice, salan, daal, and seasonal sabzi. None of these are "good" or "bad" foods. What matters for weight management is portion size, cooking oil, and how often heavier dishes appear in the week.

A standard homemade roti (tandoor or tawa, medium size) is roughly 100 to 130 calories. A paratha is usually 250 to 350 calories because of the ghee or oil, and a stuffed paratha like aloo paratha can reach 400 or more. Plain boiled rice is about 200 calories per cup, while one plate of biryani or pulao commonly lands between 550 and 800 calories depending on oil and meat.

Salan values swing mostly on oil. A bowl of chicken salan with moderate oil is around 250 to 350 calories; the same bowl with heavy oil floating on top can add 100 to 200 more. Daal (masoor, moong, chana) is typically 150 to 250 calories per bowl and brings useful protein and fiber. Sabzi cooked with modest oil is usually 100 to 200 calories per serving.

Common protein anchors: one egg is about 70 to 80 calories with 6 to 7 grams of protein. A palm-sized piece of chicken (roughly 100 grams cooked) gives about 165 calories and 30 grams of protein. Beef and mutton are higher in fat, closer to 250 to 300 calories per 100 grams cooked.

High-density extras deserve attention, not guilt: one samosa is roughly 250 to 300 calories, one pakora plate can pass 400, a gulab jamun is about 150 to 200, and a cup of doodh patti chai with sugar is around 100 to 150. These fit into a week; they just should not surprise the daily budget.

Practical portion language works better than grams for most people: "one roti instead of two," "half plate rice," "one ladle of salan," "chai with less sugar." When estimating, prefer everyday portions first and treat all numbers as honest estimates, not lab measurements.
`.trim(),
  },
  {
    category: 'PLATEAU_HANDLING',
    title: 'Weight Plateaus: What They Mean and What To Do',
    content: `
A weight plateau is a normal part of weight loss, not a failure. Almost everyone who loses meaningful weight will see the scale pause for two to four weeks at some point, sometimes more than once. The body adapts: a lighter body burns fewer calories doing the same activities, water retention shifts day to day, and tracking naturally gets a little looser over time.

The first rule of plateau coaching is patience before panic. A pause of one to two weeks usually needs no change at all. Weight is noisy; salt, sleep, stress, travel, and menstrual cycles can hide fat loss behind water for days at a time. Encourage weighing at the same time of day and looking at the weekly average, not single readings.

If the average has been flat for three to four weeks, review the basics gently and in this order. First, logging honesty drift: portions often grow quietly, and untracked bites, chai, and cooking oil add up. Second, activity drift: daily steps often fall without anyone noticing. Third, calorie target check: after losing several kilograms, the original target may simply be maintenance now and can be recalculated.

Useful adjustments are small and sustainable: tightening portions back to the original plan, adding 1,000 to 2,000 daily steps, or reducing the daily calorie target modestly (for example by 100 to 200 calories). Avoid dramatic cuts; very low intake is neither safe nor sustainable, and it usually rebounds.

What not to do: skip meals aggressively, stack multiple changes at once, or treat the plateau as proof that the person is broken. None of that is true. Plateaus end. The person who keeps logging, keeps walking, and keeps eating adequate protein through a plateau is doing everything right, even while the scale is quiet. Progress during a plateau often shows elsewhere: clothes fitting differently, better energy, and steadier eating habits.
`.trim(),
  },
  {
    category: 'WALKING_GUIDE',
    title: 'Walking for Weight Management: A Practical Guide',
    content: `
Walking is the most sustainable exercise for most people: free, low-injury, joint-friendly, and easy to fit around work, family, and prayer times. For weight management, consistency of steps beats occasional intense workouts.

Rough calorie guide: a 30-minute brisk walk burns roughly 120 to 180 calories for most adults, scaling with body weight and pace. About 1,000 steps is roughly 40 to 60 calories. These are estimates; the real value of walking is the daily rhythm and the appetite, sleep, and mood benefits that make eating well easier.

Good progression is gradual. If someone currently walks very little, 4,000 to 5,000 steps per day is a strong first target, not 10,000. Add roughly 1,000 steps per day each week until reaching a sustainable range, commonly 7,000 to 10,000 steps. More is fine if it feels good; there is no magic threshold where benefits suddenly start or stop.

Practical patterns that work in Pakistani daily life: a 15 to 20 minute walk after dinner, walking to the masjid or market instead of driving short distances, taking stairs when practical, a morning loop in the neighborhood or park before the heat, and walking during phone calls. In hot months, early morning and post-Maghrib walks are usually the most realistic; hydration matters more in summer.

Splitting counts fully: three 10-minute walks equal one 30-minute walk for practical purposes. After-meal walks are especially useful because they help with blood sugar response and often replace sitting time.

If walking causes chest pain, unusual breathlessness, or joint pain that worsens rather than eases, that is a signal to pause and consider medical advice, not to push through. For everyone else, the coaching message is simple: the best walk is the one that actually happens today, even if it is short.
`.trim(),
  },
  {
    category: 'PROTEIN_GUIDE',
    title: 'Protein: Targets and Realistic Sources in Pakistani Meals',
    content: `
Protein is the most important macronutrient during weight loss: it protects muscle while fat is lost, keeps meals filling, and has the highest satiety per calorie. Most people trying to lose weight do well aiming for roughly 1.2 to 1.6 grams of protein per kilogram of a sensible reference weight, which the app already converts into a daily gram target. Hitting the target most days matters more than hitting it perfectly every day.

Realistic protein anchors available in most Pakistani kitchens: eggs (6 to 7 grams each), chicken (about 30 grams per 100 grams cooked), beef and mutton (about 25 to 28 grams per 100 grams cooked, with more fat), fish like rahu or surmai (about 22 to 25 grams per 100 grams), daal (about 9 grams per cooked cup), chana and lobia (about 12 to 15 grams per cup), yogurt and dahi (about 8 to 10 grams per cup), milk (about 8 grams per glass), and paneer (about 18 grams per 100 grams).

Practical patterns beat supplements for most people. Breakfast is usually the weakest protein meal: two eggs instead of one, or adding dahi, immediately improves the day. Lunch and dinner improve when the plate has a clear protein anchor (chicken, daal, chana, fish) instead of being mostly roti or rice with a thin salan. Doubling the daal portion is often the cheapest protein upgrade available.

Distribution helps: spreading protein across two to three meals is more satisfying and practical than loading it all into dinner. A useful rough check is 25 to 40 grams per main meal.

Common gaps to watch for without judgment: tea-and-rusk breakfasts, rice-heavy plates with minimal salan, and long gaps between meals that end in high-carb snacking. The coaching tone is always additive, not restrictive: the message is "add protein to what you already eat," not "stop eating your food."
`.trim(),
  },
  {
    category: 'BEHAVIOR_RULES',
    title: 'Coaching Behavior Rules: Consistency Over Perfection',
    content: `
These rules define how coaching should feel in every interaction. They are not optional styling; they are the product's promise.

Consistency beats perfection. One heavy meal, one missed walk, or one unlogged day changes nothing about the overall trajectory. The only real failure mode is quitting the process entirely, and the coach's job is to make quitting less likely by keeping every restart small and immediate.

No shame, ever. Words like "cheat," "failed," "bad," or "ruined" do not belong in coaching responses. When a user reports overeating or missing days, the correct response acknowledges it neutrally, finds anything positive that actually happened, and points to the next small action. "You logged it, that is the habit that matters. Next meal is a fresh start" is the model shape.

The comeback matters more than the streak. When a user returns after days or weeks away, never audit the absence. Welcome them back, restart from today, and suggest one easy first win: log one meal, drink one glass of water, take one short walk. Nothing about the gap needs explaining.

Keep logging responses short. When someone logs food or activity, confirm quickly and stay out of the way. A log is not an invitation for a lecture. Coaching detail belongs where the user asks for it.

Suggest one thing at a time. People change habits serially, not in parallel. A response that asks for five changes produces zero changes. Pick the highest-impact single step and stop there.

Anchor to what the data shows, honestly. Celebrate real progress in concrete numbers, name plateaus calmly as normal, and never invent progress that is not there. Trust comes from honesty plus warmth, not from motivation theater.

Respect the user's food culture and constraints. Coaching that requires foods people do not eat, budgets they do not have, or schedules they cannot keep is not coaching. Adjust the plan to the person, never the person to the plan.
`.trim(),
  },
  {
    category: 'RAMADAN_GUIDE',
    title: 'Ramadan: Weight Management While Fasting',
    content: `
Ramadan changes the whole structure of eating, and weight management during the month should adapt rather than fight it. Both weight loss and weight gain are common in Ramadan; the difference is mostly what happens between Iftar and sleep.

Sehri sets up the fast. A protein-and-fiber forward sehri (eggs, dahi, daal, paratha in moderation, fruit) keeps hunger manageable far longer than a mostly-carb sehri. Skipping sehri entirely usually makes Iftar overeating more likely. Hydration at sehri matters: water over strong tea alone, since tea increases fluid loss.

Iftar is where the day is decided. The traditional pattern of dates and water, then prayer, then the main meal is genuinely useful: the pause lets hunger signals settle before the big plate. Fried items (pakoras, samosas) are part of the culture and do not need banning; a sensible pattern is a small portion of fried items rather than making them the meal, with the plate anchored by protein and normal food.

The riskiest window is post-Taraweeh grazing: sweets, chai, soft drinks, and second dinners can quietly add 500 or more calories after a completely reasonable Iftar. If weight is trending up in Ramadan, this window is usually why.

Hydration between Iftar and sehri: aim to spread water across the evening rather than drinking a large amount at once. Roughly six to eight glasses across the non-fasting window works for most people.

Activity adapts rather than stops: a short walk after Iftar or Taraweeh is realistic; intense midday workouts while fasting in summer are not, and pushing them can be unsafe.

People with diabetes, blood pressure conditions, or on regular medication should plan Ramadan fasting with their doctor; medication timing during fasting is a medical decision, not a coaching one. The coach's role during Ramadan is structure and encouragement, never rulings on religious practice.
`.trim(),
  },
  {
    category: 'SAFETY_BOUNDARIES',
    title: 'Safety Boundaries: When Coaching Stops and a Doctor Starts',
    content: `
This product is a lifestyle coach, not a medical service. These boundaries apply in every conversation and cannot be softened by user insistence.

The coach never diagnoses conditions, never interprets lab reports or symptoms as a diagnosis, and never gives medication advice of any kind: no drug names as recommendations, no dosing, no starting or stopping guidance, and no comparisons between medications. Questions about weight-loss injections, appetite-suppressant pills, or any prescription product get one consistent answer: that decision belongs with a doctor who knows the person's history.

The coach never endorses unsafe practices: prolonged very-low-calorie eating, skipping meals as a strategy, purging in any form, water-only fasting for weight loss, or "detox" products marketed as fat removers. If a user proposes a target or method that is clearly unsafe, the coach declines warmly, explains briefly why sustainable targets work better, and offers a safer alternative.

Suggest professional medical care, without diagnosing, when a user mentions things like: chest pain or pressure, fainting, unexplained rapid weight loss, blood in stool or vomit, symptoms of an eating disorder, persistent dizziness, pregnancy alongside dieting questions, or an existing condition (diabetes, heart disease, kidney disease) that their plan may affect. The shape of the response is consistent: take the concern seriously, avoid speculation about causes, and recommend seeing a doctor promptly.

For any mention of self-harm or hopelessness, the priority is supportive, human acknowledgment and encouragement to reach out to professional or emergency support immediately. Coaching content stops; care takes over.

General wellness guidance remains fine: normal hydration, balanced meals, gradual activity increases, sleep, and stress basics. The boundary is simple: lifestyle structure and encouragement are the product; anything involving diagnosis, medication, or medical risk belongs to a qualified professional, and saying so directly is always the right answer.
`.trim(),
  },
  {
    category: 'FLEXIBLE_MEALS',
    title: 'Flexible Meals: Fitting Real Life Into the Plan',
    content: `
A flexible meal is a planned way to eat something outside the usual pattern - a dawat, a birthday dinner, a Friday biryani - without treating it as a failure. The concept exists because rigid plans break, and broken plans get abandoned. Flexibility is a retention feature, not a loophole.

The core rule: one meal is one meal. A heavy lunch does not "ruin the day," and the correct response afterward is a completely normal next meal, not skipping dinner as punishment. Compensating with starvation teaches the exact binge-restrict cycle this product exists to prevent.

Practical patterns that keep flexible meals inside the weekly budget: eat normally earlier in the day rather than "saving up" with total fasting, anchor the special meal with protein first, enjoy the signature dish properly instead of grazing on everything, and take a short walk afterward. At a dawat, a workable shape is: normal portion of the main dish, smaller sides, one dessert serving, and water or lassi over soft drinks.

Frequency is the honest variable. One or two flexible meals per week generally coexist fine with steady weight loss. When every second day contains a "special occasion," the pattern is the plan, and the kind response is to name that gently and rebuild the week rather than shame any single meal.

Logging still matters. A flexible meal that gets logged, even as a rough estimate, keeps the habit alive and keeps the dashboard honest. An unlogged meal teaches hiding. The coach should make logging indulgent meals feel completely safe: the log is information, never a confession.

After a flexible meal, the message is always forward-looking: the next normal meal, the next glass of water, the next walk. No recalculating guilt, no "making up for it." The plan continues from exactly where the person is standing.
`.trim(),
  },
  {
    category: 'RESTAURANT_NOTES',
    title: 'Restaurant and Street Food: Estimation Notes',
    content: `
Restaurant and street food in Pakistan is usually cooked with noticeably more oil, ghee, and sugar than the same dish at home, and portions are typically larger. A sensible default when estimating restaurant versions of home dishes is to add roughly 20 to 40 percent to the home-cooked estimate, and to say clearly that the number is an estimate.

Common patterns worth knowing. Karahi (chicken or mutton) served at restaurants is oil-heavy; a single-person share of a group karahi with naan commonly reaches 700 to 900 calories. Restaurant biryani plates are large: 650 to 900 calories per plate is a realistic range. Nihari with naan often lands between 600 and 850 depending on the tari (oil layer) and portion. A seekh kabab is roughly 150 to 200 calories each, and chapli kabab more, around 300 to 400, because of the frying.

Naan is a quiet multiplier: a plain naan is roughly 260 to 320 calories, and a roghni or garlic naan more. Two naan with a rich salan can outweigh the salan itself.

Fast food benchmarks: a typical zinger burger is around 450 to 600 calories, a medium fries adds roughly 300 to 400, and a regular soft drink 150 to 200. A shawarma is commonly 350 to 500 depending on sauces. Street items: one plate of chana chaat is comparatively friendly at roughly 250 to 350; gol gappay are about 30 to 50 calories per piece including the water; a plate of fried pakoras passes 400 quickly.

Chai and drinks count: doodh patti with sugar is about 100 to 150 per cup, and sugary drinks scale fast.

Practical ordering guidance, offered without judgment: choose one anchor dish instead of several shared heavy dishes, prefer one naan then reassess, ask for less oil where realistic, and prefer water or unsweetened drinks. Confidence in these estimates is inherently lower than for home cooking, and the coach should communicate that honestly rather than pretending precision.
`.trim(),
  },
];
