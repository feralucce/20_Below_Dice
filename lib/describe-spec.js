/* Which entries ask the player to define something, and what to ask.
 *
 * Not every Boon, Flaw or Gift does. Berserker and Battle Sense define
 * nothing - a field on those asks the player to describe an absence.
 * The ones listed here make you settle something at creation that the
 * character then carries: what the Familiar is, which weapon system
 * Special Weapons bought, what kind of animal follows you around.
 *
 * The membership of these three lists is derived from the rules text by
 * tools/derive-describe-spec.py, which can re-derive it when the text
 * moves and has a --check mode that fails if the two disagree. The
 * prompts are written by hand, because "what the rules are asking for"
 * is not something a regex can phrase.
 *
 * `count` is how many fields the entry gets. Most want one. A few scale
 * with what was actually bought - a second Animal Companion, a fourth
 * Feature - and those take a function of the purchase.
 */

const one = () => 1;

// How many tiers deep a tiered purchase went: 1/3/5/7 points -> 1..4.
function tierIndex(entry) {
  const points = entry?.points ?? 0;
  if (points >= 7) return 4;
  if (points >= 5) return 3;
  if (points >= 3) return 2;
  return 1;
}

export const BOON_DESCRIBE = {
  'Duelist': {
    prompt: 'Which weapon Category?',
    // Tier 3 names a second one.
    count: (boon) => (tierIndex(boon) >= 3 ? 2 : 1),
  },
  'Alternate Identity': { prompt: 'Who are they? Name, history, papers.', count: one },
  'Enchanting Voice': { prompt: 'Which Skill?', count: one },
  'Familiar': { prompt: 'What is it? What do you call it?', count: one },
  // Bought once per locomotion mode, so each purchase is its own entry
  // with its own answer.
  'Special Movement': {
    prompt: 'Which mode - Water-Walking, Wall-Crawling, Tunneling or Untrackable?',
    count: one,
  },
  'Distinctive Features': {
    prompt: 'Which feature?',
    // One per tier bought, up to four.
    count: tierIndex,
  },
  'Special Weapons': { prompt: 'What is it?', count: one },
  'Trained by a Master': {
    prompt: 'Which Skill?',
    count: tierIndex,
  },
};

export const FLAW_DESCRIBE = {
  'Incantations': { prompt: 'What do you have to say out loud?', count: one },
  'Notable Appearance': { prompt: 'What do people notice?', count: one },
  'Pariah': { prompt: 'What category do people put you in?', count: one },
  'Secret': { prompt: 'What are you hiding?', count: one },
  'Shaken Confidence': { prompt: 'What happened?', count: one },
};

export const GIFT_DESCRIBE = {
  'Alternate Form': { prompt: 'What do you turn into?', count: one },
  'Animal Friendship': {
    prompt: 'What kind of animal? What is its name?',
    // Second Companion buys another, and each one is its own animal.
    count: (gift) => (gift?.adders?.includes('Second Companion') ? 2 : 1),
  },
  // Two answers, not one: the signature weapon is a real item from the
  // catalogue - it has Damage, a range and a reload - and what the
  // character calls it is the other half. The sheet needs the first to
  // put the weapon where weapons live.
  'Conjured Armory': {
    prompts: ['Which weapon from the catalogue?',
              'What do you call it, and what does it look like?'],
    // The first slot picks a real item, because the sheet reads its
    // Damage, range and reload straight off the weapons table.
    optionSlots: ['weapons', null],
    count: () => 2,
  },
  'Cybernetics': { prompt: 'What is installed, and where?', count: one },
  'Drone Swarm': { prompt: 'What are the drones?', count: one },
  'Elemental Aura': { prompt: 'Which element, and what does it look like?', count: one },
  'Elemental Manipulation': { prompt: 'Which domain do you command?', count: one },
  // The Form is one of three the rules list, and it changes Hardness and
  // Health Levels, so it is picked, not typed. What it looks like is the
  // player's own.
  'Forcefield': {
    prompts: ['Which Form?', 'What does it look like?'],
    optionSlots: ['forcefield-form', null],
    count: () => 2,
  },
  'Heightened Senses': { prompt: 'Which sense?', count: one },
  'Onslaught': { prompt: 'What do you hit them with?', count: one },
  'Necromancy': { prompt: 'What do your raised dead look like?', count: one },
  'Salvo': { prompt: 'What crosses the gap?', count: one },
  'Swarm': { prompt: 'What do you come apart into?', count: one },
  // The rules fix the ritual at creation; what gets changed is decided
  // each time.
  'Transmutation': { prompt: 'How do you perform the ritual?', count: one },
};

/* The fields one entry should show right now: its prompt, and how many
 * of them, given what has actually been bought. Anything not listed
 * gets none at all, which is the point. */
export function describeFields(kind, name, entry) {
  const table = kind === 'boon' ? BOON_DESCRIBE
    : kind === 'flaw' ? FLAW_DESCRIBE
      : GIFT_DESCRIBE;
  const spec = table[name];
  if (!spec) return 0;
  const n = spec.count(entry);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function describePrompt(kind, name) {
  const table = kind === 'boon' ? BOON_DESCRIBE
    : kind === 'flaw' ? FLAW_DESCRIBE
      : GIFT_DESCRIBE;
  const spec = table[name];
  return spec?.prompt ?? spec?.prompts?.[0] ?? '';
}

/* One prompt per slot where an entry asks two different questions, and
 * nothing where it asks the same one twice. */
/* Which catalogue, if any, each slot of an entry picks from. */
export function describeOptionSlots(kind, name) {
  const table = kind === 'boon' ? BOON_DESCRIBE
    : kind === 'flaw' ? FLAW_DESCRIBE
      : GIFT_DESCRIBE;
  return table[name]?.optionSlots ?? null;
}

export function describePrompts(kind, name) {
  const table = kind === 'boon' ? BOON_DESCRIBE
    : kind === 'flaw' ? FLAW_DESCRIBE
      : GIFT_DESCRIBE;
  return table[name]?.prompts ?? null;
}

/* Choices an Adder or Limiter makes once, at creation. The rules name
 * them inside the option's own text ("choose Bleeding or Envenomed at
 * creation"), so taking the option is not the end of it: the answer has
 * to be written down somewhere, and the sheet has to say it.
 *
 * `strict` lists are the whole answer - the option does something
 * different for each, so it is a dropdown. The rest suggest the rules'
 * own examples and leave room to write anything. `count` is how many
 * answers the option asks for. `from` reads a list out of the Gift's own
 * rules text, so it follows the book. */
const DRONE_TYPES = (gift) => [...String(gift?.markdown || '').matchAll(/^\d+\.\s+\*\*([^*:]+)\*\*/gm)]
  .map((m) => m[1].trim());

export const OPTION_CHOICES = {
  'Alternate Form': {
    'Involuntary Trigger': { prompt: 'What sets it off?', list: ['mortal danger', 'strong emotion'] },
    'Keyed Trigger': { prompt: 'Which item?', list: ['a mask', 'a charm', 'a card'] },
    'Carried Weakness': { prompt: 'Which weakness?', list: ['fire', 'silver', 'cold iron', 'loud noise'] },
  },
  'Conjured Armory': {
    'Elemental Edge': { prompt: 'Which condition?', list: ['Bleeding', 'Envenomed'], strict: true },
  },
  'Drone Swarm': {
    'Narrow Fabrication': { prompt: 'Which drone type?', from: DRONE_TYPES, strict: true, count: 3 },
  },
  'Elemental Manipulation': {
    'Second Domain': { prompt: 'Which second domain?' },
  },
  'Marked for the Hunt': {
    'Chosen Prey': { prompt: 'Which quarry?', list: ['a species', 'a faction', 'a kind of creature'] },
  },
  'Regeneration': {
    'Bane': { prompt: 'Which source?', list: ['fire', 'silver', 'acid', 'blessed weapons'] },
  },
  'Size Change': {
    'Fixed Direction': { prompt: 'Grow or shrink?', list: ['Only grow', 'Only shrink'], strict: true },
  },
  'Swarm': {
    'Fire Bane': { prompt: 'Which element?', list: ['fire'] },
  },
  'Threadspace': {
    'Chosen Threshold': { prompt: 'Which surface?', list: ['a shadow', 'a mirror', 'a doorframe', 'running water'] },
  },
  'Transmutation': {
    'Single Material': { prompt: 'Which material family?', list: ['earth and stone', 'metal', 'wood and plant fiber', 'water and ice'] },
  },
  'Undying Vigor': {
    'Specific Bane': { prompt: 'Which substance?', list: ['silver', 'a certain herb', 'blessed water'] },
  },
};

/* The choice fields one Gift should show now: one entry per Adder or
 * Limiter it has taken that asks for an answer. */
export function optionChoiceSpecs(gift, gState) {
  const table = OPTION_CHOICES[gift?.name];
  if (!table || !gState) return [];
  const taken = new Set([...(gState.adders || []), ...(gState.limiters || [])]);
  return Object.entries(table)
    .filter(([option]) => taken.has(option))
    .map(([option, s]) => ({
      option,
      prompt: s.prompt,
      count: s.count || 1,
      strict: !!s.strict,
      list: s.from ? s.from(gift) : (s.list || []),
    }));
}
