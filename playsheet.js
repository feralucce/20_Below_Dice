// The 20 Below character sheet for Owlbear Rodeo.
//
// Not the Creator's printed pages - a popover is 613 pixels wide - but
// everything on them, and everything they do: the numbers, the Vitals and
// pools that track themselves, rests and Scenes, armour that dents, and
// the one Roll dice window, whose results go to the whole room. The
// working-out is the Creator's own (app/sheet/sheet-model.js,
// app/sheet/panels.js), so the two cannot disagree about a character.
//
// The same page runs three ways: inside Owlbear (the extension, built by
// scripts/sync-playsheet.mjs), on the site at /playsheet/, and opened
// straight from disk. Outside Owlbear the rolls simply stay on this page.

import OBR from 'https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm';
import { el } from './lib/ui.js';
import {
  mergeCharacterState,
  initPlayState,
  boonNotes,
  flawNotes,
  giftNotes,
  adderLabels,
  optionWithChoice,
  skillTierName,
  fateTokenCap,
  xpSpent,
} from './lib/state.js';
import {
  SKILL_ELEMENT_COLOURS,
  coversZone,
  scarsOfKind,
  named,
  movementFigures,
  sheetContext,
  vitalStatuses,
  sheetActions,
} from './lib/sheet/sheet-model.js';
import { giftInfoPanel, movementPanel, rollDicePanel } from './lib/sheet/panels.js';
import { buildGiftCheckSection } from './lib/steps/roller-panel.js';
import buildAdvancementTab from './lib/steps/tab-advancement.js';

// Kept from the dice extension, so a character already loaded there, and
// the room's roll log, carry straight over.
const CHANNEL = 'com.feralucce.twentybelow-dice/rolls';
const STORAGE_KEY = 'twentybelow-dice.character';
// The GM's Battle Tracker talks to the sheets on its own channel: a rest
// or Fate Tokens sent to one player or to everyone, and each sheet's
// answer. Each sheet names its character in its player's metadata, so the
// tracker can list who is at the table.
const GM_CHANNEL = 'com.feralucce.twentybelow-dice/gm';
const CHARACTER_KEY = 'com.feralucce.twentybelow-dice/character';
const TAB_KEY = 'twentybelow-sheet.tab';

let data = null;
let state = null;
let connected = false;
let playerName = 'You';
let connectionId = null;
let tab = 'vitals';
const log = [];

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// the rules and the character
// ---------------------------------------------------------------------------

// The extension ships the rules baked into rules-data.json. On the site
// there is no such file, and the rules are read live the way the Creator
// reads them.
async function loadData() {
  try {
    const res = await fetch('./rules-data.json', { cache: 'no-cache' });
    if (res.ok) return await res.json();
  } catch {
    // not the extension - fall through to the live rules
  }
  const { loadRulesData } = await import('./lib/rules-data.js');
  return loadRulesData();
}

function store() {
  if (!state) return;
  try {
    const { migrationNotices, ...rest } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  } catch {
    // storage blocked - the change still holds until the popover closes
  }
}

// A character goes over a fresh initial state first, exactly as an Import
// in the Creator does, so an old save comes back with Skills renamed,
// retired Skills swapped and anything added since present and empty.
function adopt(raw) {
  const loaded = JSON.parse(raw);
  if (!loaded || typeof loaded !== 'object' || !loaded.attributes || !loaded.subStats) {
    throw new Error("That file doesn't look like a 20 Below character.");
  }
  const merged = mergeCharacterState(data, loaded);
  initPlayState(merged, data);
  return merged;
}

function loadText(raw, { announce = true } = {}) {
  try {
    state = adopt(raw);
  } catch (err) {
    say(err.message || "That file couldn't be read as a character.", true);
    return;
  }
  store();
  announceCharacter();
  if (announce && state.migrationNotices?.length) {
    say(`Some things on this character changed with the rules: ${state.migrationNotices.join(' ')}`);
  }
  draw();
}

function pickFile() {
  const input = el('input', { type: 'file', accept: '.json,application/json' });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (file) loadText(await file.text());
  });
  input.click();
}

// The tracked numbers change at the table, so the file the player opens
// in the Creator next session has to carry them. This is that file.
function saveFile() {
  if (!state) return;
  const { migrationNotices, ...rest } = state;
  const blob = new Blob([JSON.stringify(rest, null, 2)], { type: 'application/json' });
  const a = el('a', {
    href: URL.createObjectURL(blob),
    download: `${(state.name || 'character').replace(/[^\w -]+/g, '').trim() || 'character'}.json`,
  });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ---------------------------------------------------------------------------
// saying things, and the room
// ---------------------------------------------------------------------------

let sayTimer = null;
function say(text, bad = false) {
  const box = $('notice');
  box.textContent = text;
  box.className = bad ? 'notice notice-bad' : 'notice';
  box.hidden = false;
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => { box.hidden = true; }, 7000);
}

function addLog(entry) {
  log.unshift(entry);
  log.length = Math.min(log.length, 50);
  if (tab === 'log') drawBody();
  const last = $('last-roll');
  if (last) {
    last.textContent = `${entry.name}: ${entry.kind} - ${entry.headline}`;
    last.className = `last-roll ${entry.success ? 'ok' : 'bad'}`;
  }
}

// A roll is the roller's own: it lands in this log straight away, and
// goes to everyone else in the room - REMOTE, not ALL, or it would come
// back and land twice.
async function rolled(entry) {
  const full = { ...entry, name: state?.name || playerName, player: playerName, at: Date.now() };
  addLog(full);
  if (!connected) return;
  try {
    await OBR.broadcast.sendMessage(CHANNEL, full, { destination: 'REMOTE' });
  } catch (err) {
    console.error('20 Below Character Sheet: broadcast failed', err);
  }
}

// Tells the room which character this player has open, for the GM's list.
async function announceCharacter() {
  if (!connected) return;
  try {
    await OBR.player.setMetadata({ [CHARACTER_KEY]: state ? { name: state.name || 'Unnamed character' } : null });
  } catch (err) {
    console.error('20 Below Character Sheet: could not name the character to the room', err);
  }
}

// The GM gives a Short Rest, a Full Night's Rest or Fate Tokens. It lands
// at once. The GM can give as many Short Rests as the story allows - the
// one-between-nights limit is only on the player's own button - but Tokens
// still stop at the holding cap. The GM hears back what happened.
async function fromGM(msg) {
  if (!msg || msg.type === 'result') return;
  if (msg.to && msg.to !== connectionId) return;
  if (!state) {
    answerGM(`${playerName} has no character loaded, so nothing changed.`, false);
    return;
  }
  const notes = [];
  const act = sheetActions(state, data, sheetContext(state, data).figured, (t) => notes.push(t));
  let text;
  let ok = true;
  if (msg.type === 'rest') {
    const label = msg.full ? "a Full Night's Rest" : 'a Short Rest';
    if (!msg.full) state.shortRestTaken = false;
    ok = act.rest(!!msg.full);
    text = ok ? `The GM gave you ${label}.` : `The GM gave you ${label}, but it didn't apply.`;
  } else if (msg.type === 'fate') {
    const cap = fateTokenCap(state, data);
    const before = state.currentFateTokens ?? 0;
    const by = Math.max(1, Math.round(Number(msg.amount) || 1));
    state.currentFateTokens = Math.min(cap, before + by);
    const got = state.currentFateTokens - before;
    ok = got > 0;
    text = got === by
      ? `The GM gave you ${by} Fate Token${by === 1 ? '' : 's'}.`
      : `The GM gave you ${by} Fate Token${by === 1 ? '' : 's'}; you kept ${got}, the most you can hold is ${cap}.`;
  } else {
    return;
  }
  const full = [text, ...notes].join(' ');
  store();
  draw();
  say(full, !ok);
  addLog({ name: 'GM', kind: msg.type === 'rest' ? 'Rest' : 'Fate Tokens', headline: full, success: ok });
  answerGM(`${state.name || playerName}: ${full.replace(/^The GM gave you/, 'got')}`, ok);
}

async function answerGM(text, ok) {
  try {
    await OBR.broadcast.sendMessage(GM_CHANNEL, { type: 'result', text, ok }, { destination: 'REMOTE' });
  } catch (err) {
    console.error('20 Below Character Sheet: could not answer the GM', err);
  }
}

// ---------------------------------------------------------------------------
// the window over the sheet
// ---------------------------------------------------------------------------

let modal = null;
function openModal(contents) {
  modal?.remove();
  const panel = el('div', { class: 'modal-panel' }, [
    ...contents,
    el('button', { type: 'button', class: 'btn', text: 'Close', onClick: closeModal }),
  ]);
  modal = el('div', {
    class: 'modal',
    onClick: (e) => { if (e.target === modal) closeModal(); },
  }, [panel]);
  document.body.appendChild(modal);
}
function closeModal() {
  modal?.remove();
  modal = null;
  draw();
}

function openRoller() {
  if (!state) return;
  openModal(rollDicePanel(state, data, {
    // A failed Gift Check takes 1 Ki; the save happens now so closing the
    // popover mid-window cannot lose it.
    onKi: () => store(),
    onRolled: (entry) => { store(); rolled(entry); },
    initiativeSent: connected ? "It's sent to the room, and the GM's Battle Tracker fills it in." : null,
  }));
}

// ---------------------------------------------------------------------------
// drawing
// ---------------------------------------------------------------------------

const TABS = [
  ['vitals', 'Vitals'],
  ['skills', 'Skills'],
  ['gifts', 'Gifts'],
  ['gear', 'Gear'],
  ['notes', 'Notes'],
  ['advance', 'Advance'],
  ['log', 'Log'],
];

const EXHAUSTED = [
  '',
  'Disadvantage on Physical rolls',
  'Disadvantage on all rolls',
  'Movement Rate halved; no Fast actions',
  'Every Ki spend costs +1',
  'Unconscious, until warmed, cooled, or rested',
];

function draw() {
  $('who').textContent = state ? state.name || 'Unnamed character' : '20 Below Character Sheet';
  $('concept').textContent = state?.concept || '';
  $('btn-roll').disabled = !state;
  $('btn-save').disabled = !state;
  const bar = $('tabs');
  bar.innerHTML = '';
  if (state) {
    TABS.forEach(([id, label]) => bar.appendChild(el('button', {
      type: 'button',
      class: id === tab ? 'tab on' : 'tab',
      text: label,
      onClick: () => {
        tab = id;
        try { localStorage.setItem(TAB_KEY, id); } catch { /* per-viewer nicety only */ }
        draw();
      },
    })));
  }
  drawBody();
}

function drawBody() {
  const body = $('body');
  body.innerHTML = '';
  if (!state) {
    body.append(
      el('div', { class: 'empty' }, [
        el('p', {}, 'Load the character you exported from the Character Creator.'),
        el('button', { type: 'button', class: 'btn btn-main', text: 'Load character', onClick: pickFile }),
      ]),
      logBlock(),
    );
    return;
  }
  const ctx = sheetContext(state, data);
  // Every button changes the character, saves it and redraws.
  const act = sheetActions(state, data, ctx.figured, (t) => say(t));
  const set = (fn) => () => { fn(); store(); draw(); };
  const view = {
    vitals: vitalsTab, skills: skillsTab, gifts: giftsTab, gear: gearTab, notes: notesTab,
    advance: advanceTab, log: logBlock,
  }[tab] || vitalsTab;
  body.append(...[].concat(view(ctx, act, set)));
}

const block = (title, children, cls = '') => el('section', { class: `block ${cls}` }, [
  title ? el('h2', {}, title) : null,
  ...[].concat(children),
].filter(Boolean));

function stepper(act, set, key, value, max, extra = '') {
  return el('div', { class: 'stepper' }, [
    el('button', { type: 'button', class: 'step', text: '−', title: 'down one', onClick: set(() => act.step(key, -1)) }),
    el('span', { class: 'count' }, max == null ? `${value}` : `${value} / ${max}`),
    el('button', { type: 'button', class: 'step', text: '+', title: 'up one', onClick: set(() => act.step(key, 1)) }),
    extra ? el('span', { class: 'hint' }, extra) : null,
  ].filter(Boolean));
}

// Filled boxes up to the value, from 0 to the maximum; below 0 the count
// beside it says how far.
function bar(value, max, colour) {
  const boxes = [];
  for (let i = 0; i < max; i += 1) {
    boxes.push(el('span', { class: i < value ? 'pip on' : 'pip', style: `--c:${colour}` }));
  }
  return el('div', { class: 'pips' }, boxes);
}

function vitalsTab(ctx, act, set) {
  const { figured } = ctx;
  const status = vitalStatuses(state, figured);
  const elements = (data.attributes || []).map((a) => el('div', {
    class: 'element',
    style: `--c:${SKILL_ELEMENT_COLOURS[a.name] || '#8fadbe'}`,
  }, [
    el('div', { class: 'element-head' }, [el('span', {}, a.name), el('strong', {}, `${state.attributes[a.name] ?? 0}`)]),
    ...(a.splitsInto || []).map((sub) => el('div', { class: 'substat' }, [
      el('span', {}, sub), el('span', {}, `${state.subStats[sub] ?? 0}`),
    ])),
  ]));

  const move = movementFigures(state, figured, ctx.armour);
  const figure = (label, value, onClick) => el(onClick ? 'button' : 'div', {
    type: onClick ? 'button' : undefined,
    class: onClick ? 'figure figure-btn' : 'figure',
    onClick,
    title: onClick ? 'Dash, Sprint, jumps and travel' : undefined,
  }, [el('span', {}, label), el('strong', {}, `${value}`)]);

  const vital = (label, key, value, max, colour, lit) => el('div', { class: 'vital' }, [
    el('div', { class: 'vital-head' }, [
      el('span', { class: 'vital-name', style: `color:${colour}` }, label),
      lit ? el('span', { class: 'lit', style: `--c:${colour}` }, lit === 'Dead' ? 'DEAD' : lit.toUpperCase()) : null,
      stepper(act, set, key, value, max),
    ].filter(Boolean)),
    bar(value, max, colour),
  ]);

  const exhausted = state.exhausted ?? 0;
  const spent = state.fateSpentThisScene ?? 0;
  const stamina = Number(state.subStats?.Stamina) || 0;

  return [
    block('Elements', el('div', { class: 'elements' }, elements)),
    block('Figured', el('div', { class: 'figures' }, [
      figure('Defense', figured.Defense),
      figure('Social Def', figured['Social Defense']),
      figure('Mental Def', figured['Mental Defense']),
      figure('Movement', move.rate, () => openModal(movementPanel(move))),
      figure('Carry', figured['Carrying Capacity']),
    ])),
    block('Vitals', [
      vital('Health', 'vital.health', state.currentHealth, figured['Health Levels'], '#6FBF73', status.health),
      vital('Poise', 'vital.poise', state.currentPoise, figured.Poise, '#E0A85C', status.poise),
      vital('Sanity', 'vital.sanity', state.currentSanity, figured.Sanity, '#6FB8E0', status.sanity),
    ]),
    block('Pools', [
      el('div', { class: 'pool' }, [el('span', { class: 'pool-name' }, 'Ki'),
        stepper(act, set, 'pool.ki', state.currentKi, figured.Ki)]),
      el('div', { class: 'pool' }, [el('span', { class: 'pool-name' }, 'Fate Tokens'),
        stepper(act, set, 'pool.fate', state.currentFateTokens, fateTokenCap(state, data),
          `spent this Scene ${spent} of ${stamina}`)]),
      el('div', { class: 'pool' }, [el('span', { class: exhausted ? 'pool-name exhausted' : 'pool-name' }, 'Exhausted'),
        stepper(act, set, 'exhausted', exhausted, 5, EXHAUSTED.slice(1, exhausted + 1).join('; '))]),
    ]),
    el('div', { class: 'rests' }, [
      el('button', { type: 'button', class: 'btn', text: 'Short rest', onClick: () => { if (act.rest(false)) { store(); draw(); } } }),
      el('button', { type: 'button', class: 'btn', text: "Full night's rest", onClick: () => { if (act.rest(true)) { store(); draw(); } } }),
      el('button', { type: 'button', class: 'btn btn-scene', text: 'New Scene', onClick: set(() => act.newScene()) }),
    ]),
  ];
}

function skillsTab(ctx) {
  const skills = ctx.skills.map((s) => el('div', { class: 'row' }, [
    el('span', { class: 'row-name' }, [
      s.name,
      s.joat ? null : el('span', { class: 'tag', style: `color:${SKILL_ELEMENT_COLOURS[s.element] || '#8fadbe'}` },
        s.retired ? 'Retired' : (SKILL_ELEMENT_COLOURS[s.element] ? s.element : 'Any')),
    ].filter(Boolean)),
    el('span', { class: 'row-value' }, s.retired ? s.note || '' : skillTierName(data, s.tier)),
  ]));
  const boons = (state.boons || []).map((b) => el('div', { class: 'row' }, [
    el('span', { class: 'row-name' }, named(b.name, boonNotes(b))),
    el('span', { class: 'row-value' }, `${b.points} pts`),
  ]));
  const flaws = ctx.flaws.map((f) => el('div', { class: 'row' }, [
    el('span', { class: 'row-name' }, named(f.name, flawNotes(f))),
    el('span', { class: 'row-value' }, `Level ${f.level}`),
  ]));
  const resources = ctx.resources.map((r) => el('div', { class: 'row' }, [
    el('span', { class: 'row-name' }, r.name),
    el('span', { class: 'row-value' }, r.zeroed ? 'spent'
      : r.now !== r.level ? `Level ${r.now} (of ${r.level})` : `Level ${r.level}`),
  ]));
  const none = (what) => el('p', { class: 'hint' }, `No ${what}.`);
  return [
    block('Skills', skills.length ? skills : none('Skills')),
    block('Boons', boons.length ? boons : none('Boons')),
    block('Flaws', flaws.length ? flaws : none('Flaws')),
    block('Resources', resources.length ? resources : none('Resources')),
  ];
}

function giftsTab(ctx, act, set) {
  if (!ctx.gifts.length) return [block('Gifts', el('p', { class: 'hint' }, 'No Gifts.'))];
  // Ki is what Gifts run on, so it is ticked here as well as on Vitals.
  // A failed Gift Check takes its Ki at once; the count follows without
  // redrawing the tab, so the Check's result stays on screen.
  const kiRow = stepper(act, set, 'pool.ki', state.currentKi, ctx.figured.Ki);
  const showKi = () => {
    kiRow.querySelector('.count').textContent = `${state.currentKi} / ${ctx.figured.Ki}`;
  };
  const check = buildGiftCheckSection(state, data, () => { store(); showKi(); }, {
    onRolled: (entry) => { store(); showKi(); rolled(entry); },
  });
  const top = block('Ki and Gift Check', [
    el('div', { class: 'pool' }, [el('span', { class: 'pool-name' }, 'Ki'), kiRow]),
    el('div', { class: 'gift-check' }, [].concat(check)),
  ]);
  return [top, ...ctx.gifts.map((g) => {
    const adders = adderLabels(g.adders).map((l) => optionWithChoice(g, l, l.replace(/ ×\d+$/, '')));
    const limiters = (g.limiters || []).map((l) => optionWithChoice(g, l));
    const ki = ctx.giftKi(g);
    return el('button', {
      type: 'button',
      class: 'gift',
      title: `What ${g.name} does`,
      onClick: () => openModal(giftInfoPanel(g, data)),
    }, [
      el('div', { class: 'gift-head' }, [
        el('span', { class: 'gift-name' }, named(g.name, giftNotes(g))),
        el('span', { class: 'gift-level' }, `Level ${g.level}${ki ? ` · ${ki} Ki` : ''}`),
      ]),
      el('p', { class: 'gift-does' }, ctx.giftText(g)),
      adders.length ? el('p', { class: 'gift-opts' }, [el('strong', {}, 'Adders: '), adders.join(', ')]) : null,
      limiters.length ? el('p', { class: 'gift-opts' }, [el('strong', {}, 'Limiters: '), limiters.join(', ')]) : null,
      el('span', { class: 'gift-more' }, 'What it does →'),
    ].filter(Boolean));
  })];
}

function gearTab(ctx, act, set) {
  const weapons = ctx.weapons.map((w) => el('tr', {}, [
    el('td', {}, w.name), el('td', {}, w.damage), el('td', {}, w.range || ''), el('td', {}, w.ammo || ''),
  ]));
  const zones = (a) => [['com', 'Body'], ['head', 'Head'], ['arms', 'Arms'], ['legs', 'Legs']]
    .filter(([z]) => coversZone(a.zone, z)).map(([, n]) => n).join(', ') || a.zone || '';
  const armour = ctx.armour.map((a) => el('div', { class: a.broken ? 'armour broken' : 'armour' }, [
    el('div', { class: 'row' }, [
      el('span', { class: 'row-name' }, a.name),
      el('span', { class: 'row-value' }, `Hardness ${a.hardness}`),
    ]),
    el('div', { class: 'row' }, [
      el('span', { class: 'hint' }, zones(a)),
      a.health ? el('div', { class: 'stepper' }, [
        el('button', { type: 'button', class: 'step', text: '−', title: 'take one Health Level', onClick: set(() => act.dentArmour(a, 1)) }),
        el('span', { class: 'count' }, a.broken ? 'broken' : `${a.current} / ${a.health} HL`),
        el('button', { type: 'button', class: 'step', text: '+', title: 'repair one Health Level', onClick: set(() => act.dentArmour(a, -1)) }),
      ]) : null,
    ].filter(Boolean)),
  ]));
  return [
    block('Weapons', ctx.weapons.length
      ? el('table', { class: 'table' }, [
        el('tr', {}, ['Weapon', 'Damage', 'Range', 'Ammo'].map((h) => el('th', {}, h))),
        ...weapons,
      ])
      : el('p', { class: 'hint' }, 'No weapons.')),
    block('Armour', armour.length ? armour : el('p', { class: 'hint' }, 'No armour.')),
    block('Equipment', ctx.gear.length
      ? el('ul', { class: 'list' }, ctx.gear.map((g) => el('li', {}, g)))
      : el('p', { class: 'hint' }, 'No equipment.')),
  ];
}

function notesTab(ctx) {
  const n = state.nature || {};
  const picked = n.picked ? (data.natures || []).find((x) => x.name === n.picked) : null;
  const nature = n.picked ?? n.custom?.label ?? '';
  const descriptors = (data.attributes || []).flatMap((a) => a.splitsInto || [])
    .map((sub) => [sub, (state.descriptors?.[sub] || []).filter(Boolean)])
    .filter(([, list]) => list.length)
    .map(([sub, list]) => el('div', { class: 'row' }, [
      el('span', { class: 'row-name' }, sub), el('span', { class: 'row-value wrap' }, list.join(', ')),
    ]));
  const scars = ['battle', 'mental', 'social'].flatMap((kind) => scarsOfKind(state, kind).map((s) => el('div', { class: 'row' }, [
    el('span', { class: 'row-name' }, s.title || s.description || 'Scar'),
    el('span', { class: 'row-value' }, `${kind}${s.belowZero ? ' · below 0' : ''}`),
  ])));
  const text = (label, key) => el('label', { class: 'textbox' }, [
    el('span', {}, label),
    el('textarea', {
      rows: 5,
      onInput: (e) => { state[key] = e.target.value; store(); },
    }, state[key] || ''),
  ]);
  return [
    block('Nature', nature ? [
      el('p', {}, [el('strong', {}, nature)]),
      picked?.drive || n.custom?.drive ? el('p', {}, [el('span', { class: 'hint' }, 'The drive: '), picked?.drive ?? n.custom?.drive]) : null,
      picked?.example || n.custom?.trigger ? el('p', {}, [el('span', { class: 'hint' }, 'A Token when: '),
        (picked?.example ?? n.custom?.trigger ?? '').replace(/^\s*take a fate token when\s*/i, '')]) : null,
    ].filter(Boolean) : el('p', { class: 'hint' }, 'No Nature.')),
    block('Descriptors', descriptors.length ? descriptors : el('p', { class: 'hint' }, 'No Descriptors.')),
    block('Scars', scars.length ? scars : el('p', { class: 'hint' }, 'No scars.')),
    block(null, [text('Backstory', 'backstory'), text('Notes', 'finishingNotes')]),
  ];
}

// Experience, earned and spent in the sheet: the GM awards XP at the
// table, the player adds it here, and spends it with the Creator's own
// Advancement sections - no trip to the Creator and back. Every change
// saves at once; Save puts it in the file for next session.
function advanceTab() {
  const earned = Number(state.xpEarned) || 0;
  const spentXp = xpSpent(state, data);
  const amount = el('input', { type: 'number', step: '1', class: 'xp-input', placeholder: 'XP' });
  const add = () => {
    const n = Math.round(Number(amount.value));
    if (!Number.isFinite(n) || !n) return;
    state.xpEarned = Math.max(0, earned + n);
    say(n > 0 ? `Added ${n} XP.` : `Took off ${-n} XP.`);
    keepScroll(() => { store(); draw(); });
  };
  amount.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  const refresh = () => keepScroll(() => { store(); draw(); });
  return [
    block('Experience', [
      el('div', { class: 'figures' }, [
        el('div', { class: 'figure' }, [el('span', {}, 'Earned'), el('strong', {}, `${earned}`)]),
        el('div', { class: 'figure' }, [el('span', {}, 'Spent'), el('strong', {}, `${spentXp}`)]),
        el('div', { class: 'figure' }, [el('span', {}, 'Unspent'), el('strong', {}, `${earned - spentXp}`)]),
      ]),
      el('div', { class: 'xp-add' }, [
        el('span', {}, 'XP from this session'),
        amount,
        el('button', { type: 'button', class: 'btn btn-main', text: 'Add', onClick: add }),
      ]),
      el('p', { class: 'hint' }, 'A mistake? Add it as a minus number.'),
    ]),
    block('Spend XP', [
      el('p', { class: 'hint' }, 'Open a section to raise what you want. It saves as you go; Save puts it in your file.'),
      el('div', { class: 'advance' }, buildAdvancementTab(state, data, refresh, { xpField: false })),
    ]),
  ];
}

// Redraws without jumping back to the top of the tab.
function keepScroll(fn) {
  const scroller = document.scrollingElement || document.documentElement;
  const y = scroller.scrollTop;
  fn();
  scroller.scrollTop = y;
}

function logBlock() {
  const rows = log.map((e) => el('div', { class: `log-row ${e.success ? 'ok' : 'bad'}` }, [
    el('div', {}, [el('strong', {}, e.name), ` · ${e.kind} - `, el('span', { class: 'log-head' }, e.headline)]),
    e.detail ? el('div', { class: 'hint' }, e.detail) : null,
  ].filter(Boolean)));
  return block(`Rolls in this room${connected ? '' : ' (not connected: only yours)'}`,
    rows.length ? rows : el('p', { class: 'hint' }, 'No rolls yet this session.'));
}

// ---------------------------------------------------------------------------
// start
// ---------------------------------------------------------------------------

async function start() {
  $('btn-roll').addEventListener('click', openRoller);
  $('btn-load').addEventListener('click', pickFile);
  $('btn-save').addEventListener('click', saveFile);
  try { tab = localStorage.getItem(TAB_KEY) || tab; } catch { /* default tab */ }

  try {
    data = await loadData();
  } catch (err) {
    $('body').innerHTML = '';
    $('body').append(el('p', { class: 'notice notice-bad' },
      `The rules couldn't be loaded, so the sheet can't open. Reload to try again. (${err.message})`));
    return;
  }

  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* nothing kept */ }
  if (saved) loadText(saved, { announce: false });
  else draw();

  try {
    OBR.onReady(async () => {
      connected = true;
      $('conn').classList.add('on');
      $('conn').title = 'Connected to the room';
      try { playerName = await OBR.player.getName(); } catch { playerName = 'You'; }
      try { connectionId = await OBR.player.getConnectionId(); } catch { connectionId = null; }
      OBR.broadcast.onMessage(CHANNEL, (event) => addLog(event.data));
      OBR.broadcast.onMessage(GM_CHANNEL, (event) => fromGM(event.data));
      announceCharacter();
      if (tab === 'log') drawBody();
    });
  } catch (err) {
    console.warn('20 Below Character Sheet: not inside Owlbear Rodeo, rolls stay on this page', err);
  }
}

start();
