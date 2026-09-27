import { el, keyedDetails, counterRow, renderMarkdown } from '../ui.js';
import {
  computeFiguredCharacteristics,
  kiPurchaseCost,
  kiPurchaseCap,
  canBuyKi,
  buyAdvancementKi,
  refundAdvancementKi,
  subStatPoolRemaining,
  descriptorSlots,
  skillTierName,
  giftLevelCost,
  xpSpent,
  xpRemaining,
  buyAdvancementAttributePoint,
  refundAdvancementAttributePoint,
  buyAdvancementSkillTier,
  refundAdvancementSkillTier,
  buyAdvancementResourceLevel,
  refundAdvancementResourceLevel,
  advancementGiftLevelCostAt,
  buyAdvancementGiftLevel,
  refundAdvancementGiftLevel,
  buyAdvancementGiftAdder,
  refundAdvancementGiftAdder,
  adderCount,
  optionBlock,
  flawBuyoffCost,
  buyOffFlawLevel,
  restoreFlawLevel,
} from '../state.js';
import { renderBoonPicker } from './07-boons.js';

// A collapsed-by-default category - click its name to twirl the whole
// section (every item inside it) open, matching the Discretionary Points
// page's same treatment. Returns the content element to append items into;
// titleText becomes the always-visible summary line.
function sectionWrap(titleText) {
  const details = keyedDetails(`adv-sec:${titleText}`, { class: 'pick-card' });
  const content = el('div', { style: 'margin-top:0.75rem;' });
  details.append(el('summary', {}, titleText), content);
  return { details, content };
}

// A brief, always-visible reminder of what an item is, under its row -
// distinct from Gifts/Boons' existing full-description twirls.
function briefDetail(text) {
  return el('p', { class: 'detail', style: 'color:var(--text-dim);font-size:0.85rem;margin:0 0 0.75rem;' }, text);
}

function descriptorInputs(container, state, data, subName, refresh) {
  const slots = descriptorSlots(state, subName);
  const arr = state.descriptors[subName];
  while (arr.length < slots) arr.push('');
  while (arr.length > slots) arr.pop();
  if (slots === 0) return;
  container.append(el('div', { class: 'field-label' }, `${subName} Descriptors`));
  arr.forEach((val, i) => {
    container.append(
      el('input', {
        type: 'text',
        value: val,
        placeholder: `Descriptor ${i + 1}`,
        style: 'display:block;margin:0.15rem 0;',
        onInput: (e) => {
          arr[i] = e.target.value;
        },
      }),
    );
  });
}

function attributesSection(state, data, refresh) {
  const { details, content: section } = sectionWrap(`Attributes (current rating × ${data.advancement.attributeXpMultiplier} XP)`);
  data.attributes.forEach((a) => {
    const rating = state.attributes[a.name];
    const cost = rating * data.advancement.attributeXpMultiplier;
    const remaining = xpRemaining(state, data);
    const bought = state.advancementPurchases.Attributes[a.name] ?? 0;
    const card = el('div', { class: 'pick-card' });
    card.append(
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:0.5rem;' }, [
        el('strong', {}, `${a.name}: ${rating}`),
        el('div', {}, [
          bought > 0
            ? el('button', {
                type: 'button',
                text: 'Undo raise',
                onClick: () => {
                  refundAdvancementAttributePoint(state, a.name);
                  refresh();
                },
              })
            : null,
          el('button', {
            type: 'button',
            text: `Raise to ${rating + 1} (${cost} XP)`,
            // An Attribute stops at the rating where both of its sub-stats are
            // full (rules/costs.md, Universal Caps) - there is nothing left for
            // a further point to grant.
            disabled: cost > remaining || rating >= data.attributeMax ? '' : undefined,
            onClick: () => {
              buyAdvancementAttributePoint(state, a.name);
              refresh();
            },
          }),
        ]),
      ]),
      briefDetail(a.description),
    );

    const subRemaining = subStatPoolRemaining(state, data, a.name);
    const [subA, subB] = a.splitsInto;
    if (subRemaining > 0) {
      card.append(el('p', { class: 'detail' }, `${subRemaining} Sub-Stat point(s) to allocate (free, from Attribute raises):`));
      [subA, subB].forEach((subName) => {
        // min is pinned to the sub-stat's own current value - a split is
        // permanent once spent (see rules.md#sub-category-allocation), so
        // this control can only ever place the newly-granted point, never
        // pull an already-spent one back off.
        const floor = state.subStats[subName];
        card.append(
          counterRow({
            name: subName,
            get: () => state.subStats[subName],
            set: (v) => {
              state.subStats[subName] = v;
            },
            min: () => floor,
            max: () => Math.min(
              data.subStatCap,
              state.subStats[subName] + subStatPoolRemaining(state, data, a.name),
            ),
            onChange: refresh,
          }),
        );
      });
    }
    [subA, subB].forEach((subName) => descriptorInputs(card, state, data, subName, refresh));
    section.appendChild(card);
  });
  return details;
}

function skillsSection(state, data, refresh) {
  const { details, content: section } = sectionWrap(`Skills (new Skill ${data.advancement.newSkillXp} XP, then current tier × ${data.advancement.skillTierXpMultiplier} XP)`);
  const filterInput = el('input', { type: 'text', placeholder: 'Filter skills...' });
  const listEl = el('div', { class: 'pick-list' });
  section.append(filterInput, listEl);

  function renderList() {
    listEl.innerHTML = '';
    const filter = filterInput.value.toLowerCase();
    data.skillCatalog
      .filter((s) => s.name.toLowerCase().includes(filter))
      .forEach((s) => {
        const tier = state.skills[s.name];
        const cost = tier === 0 ? data.advancement.newSkillXp : tier * data.advancement.skillTierXpMultiplier;
        const bought = state.advancementPurchases.Skills[s.name] ?? 0;
        const row = counterRow({
          name: s.name,
          hint: tier < 5 ? `${cost} XP` : 'maxed',
          get: () => tier,
          set: (v) => {
            if (v > tier) buyAdvancementSkillTier(state, s.name);
            else refundAdvancementSkillTier(state, s.name);
          },
          min: tier - bought,
          max: () => (tier < 5 && cost <= xpRemaining(state, data) ? tier + 1 : tier),
          format: (v) => skillTierName(data, v),
          onChange: refresh,
        });
        row.classList.add('counter-row-compact');
        const wrap = el('div', {}, [row, briefDetail(s.definition)]);
        listEl.appendChild(wrap);
      });
  }
  filterInput.addEventListener('input', renderList);
  renderList();
  return details;
}

function resourcesSection(state, data, refresh) {
  const newXp = data.advancement.newResourceXp;
  const mult = data.advancement.resourceLevelXpMultiplier;
  const { details, content: section } = sectionWrap(
    `Resources (new Resource ${newXp} XP, then current level × ${mult} XP)`,
  );
  data.resources.forEach((r) => {
    const level = state.resources[r.name];
    // Acquiring one is a flat price; every step after is priced off the level
    // being left, so the ladder gets steeper as it climbs.
    const cost = level === 0 ? newXp : level * mult;
    const remaining = xpRemaining(state, data);
    const bought = state.advancementPurchases.Resources[r.name] ?? 0;
    const card = el('div', { class: 'pick-card' });
    card.append(
      el('div', { class: 'counter-row' }, [
        el('span', { class: 'name' }, `${r.name} - Level ${level}`),
        bought > 0
          ? el('button', {
              type: 'button',
              text: 'Undo',
              onClick: () => {
                refundAdvancementResourceLevel(state, r.name);
                refresh();
              },
            })
          : null,
        level < 5
          ? el('button', {
              type: 'button',
              text: level === 0 ? `Take it (${cost} XP)` : `Raise (${cost} XP)`,
              disabled: cost > remaining ? '' : undefined,
              onClick: () => {
                buyAdvancementResourceLevel(state, r.name);
                refresh();
              },
            })
          : null,
      ]),
      briefDetail(r.scales),
    );
    section.appendChild(card);
  });
  return details;
}

function giftsSection(state, data, refresh) {
  const { details, content: section } = sectionWrap(
    `Gifts (new Gift ${data.advancement.newGiftBaseXp} XP, raise = current level × ${data.advancement.giftLevelXpMultiplier} XP, both reduced by Limiters, floored at ${data.advancement.giftLimiterFloor}; Adders: Lesser ${data.advancement.giftAdderXp.Lesser} / Greater ${data.advancement.giftAdderXp.Greater} XP)`,
  );
  data.gifts.forEach((gift) => {
    const gState = state.gifts.find((g) => g.name === gift.name);
    const level = gState?.level ?? 0;
    // Optional chaining stops the whole chain when gState is missing, but not
    // when gState exists without the array - an older save, or a Gift added
    // by a path that did not initialise it.
    const limiterCount = gState?.limiters?.length ?? 0;
    const cost = advancementGiftLevelCostAt(data, level, limiterCount);
    const remaining = xpRemaining(state, data);
    const boughtLevels = state.advancementPurchases.Gifts[gift.name] ?? 0;
    // Keyed by the Gift, not by the summary: the summary carries the level,
    // and raising it is the click whose open card must survive.
    const card = keyedDetails(`adv-gift:${gift.name}`, { class: 'pick-card' });
    card.append(
      el('summary', {}, `${gift.name} - Level ${level}`),
      el('div', { class: 'detail', html: renderMarkdown(gift.markdown) }),
    );
    const btnRow = el('div', { style: 'display:flex;gap:0.5rem;flex-wrap:wrap;margin:0.5rem 0;' }, [
      boughtLevels > 0
        ? el('button', {
            type: 'button',
            text: 'Undo last raise',
            onClick: () => {
              refundAdvancementGiftLevel(state, gift.name);
              refresh();
            },
          })
        : null,
      level < 5
        ? el('button', {
            type: 'button',
            text: `${level === 0 ? 'Acquire' : 'Raise'} to Level ${level + 1} (${cost} XP)`,
            disabled: cost > remaining ? '' : undefined,
            onClick: () => {
              buyAdvancementGiftLevel(state, gift.name);
              refresh();
            },
          })
        : null,
    ]);
    card.appendChild(btnRow);

    if (level > 0 && gift.adders.length) {
      const addersRow = el('div', { style: 'margin:0.25rem 0 0.5rem 0.5rem;' });
      gift.adders.forEach((adder) => {
        const owned = (gState?.adders ?? []).includes(adder.name);
        const count = adderCount(gState, adder.name);
        const blocked = !owned && optionBlock(gState, adder);
        const boughtHere = (state.advancementPurchases.GiftAdders?.[gift.name] ?? []).includes(adder.name);
        const adderXp = data.advancement.giftAdderXp[adder.tier];
        addersRow.appendChild(
          el('div', { style: 'display:flex;gap:0.5rem;align-items:center;margin:0.15rem 0;' }, [
            el('span', {}, `${adder.name} (${adder.tier}, ${adderXp} XP)${owned ? (count > 1 ? ` - owned ×${count}` : ' - owned') : ''}${blocked ? ` - ${blocked}` : ''}`),
            !owned || adder.repeatable
              ? el('button', {
                  type: 'button',
                  text: owned ? 'Buy another' : 'Buy',
                  disabled: adderXp > remaining || blocked ? '' : undefined,
                  onClick: () => {
                    buyAdvancementGiftAdder(state, gift.name, adder.name, adder.repeatable);
                    refresh();
                  },
                })
              : null,
            owned && boughtHere
              ? el('button', {
                  type: 'button',
                  text: 'Undo',
                  onClick: () => {
                    refundAdvancementGiftAdder(state, gift.name, adder.name);
                    refresh();
                  },
                })
              : null,
          ]),
        );
      });
      card.appendChild(addersRow);
    }

    // Limiters are permanent - they define what the Gift is, and no amount of
    // XP removes one. Listed here so the constraint stays visible while the
    // player is spending on the Gift, but there is nothing to click.
    // gState is undefined for every Gift the character does not own, which is
    // most of them - this threw and took the whole Advancement tab with it.
    if (gift.limiters.length && gState?.limiters?.length) {
      const limitersRow = el('div', { style: 'margin:0.25rem 0 0.5rem 0.5rem;' });
      gState.limiters.forEach((name) => {
        limitersRow.appendChild(el('div', { class: 'muted', style: 'margin:0.15rem 0;' }, `Limiter: ${name}`));
      });
      card.appendChild(limitersRow);
    }
    section.appendChild(card);
  });
  return details;
}

function boonsSection(state, data, refresh) {
  const { details, content: section } = sectionWrap(`Boons (× ${data.advancement.boonXpMultiplier} creation cost)`);
  renderBoonPicker(section, { state, rerenderStep: refresh, rerenderPools: () => {} }, data.boons, {
    source: 'advancement',
    getRemaining: () => xpRemaining(state, data),
    toCurrency: (points) => points * data.advancement.boonXpMultiplier,
    currencyLabel: 'XP',
  });
  return details;
}


// Ki is the only figured characteristic XP can touch directly. Everything
// else on the sheet is derived and stays derived.
function kiSection(state, data, refresh) {
  const f = computeFiguredCharacteristics(state);
  const base = f['Figured Ki'];
  const cap = kiPurchaseCap(state, data);
  const maxBought = cap - base;
  const { details, content } = sectionWrap(
    `Ki (${f.Ki} of a possible ${cap}, next point ${kiPurchaseCost(state, data)} XP)`,
  );
  content.appendChild(briefDetail(
    'Ki is your strongest Element plus 8. XP can carry it to twice that, and '
    + 'each point costs whatever the pool stands at when you buy it - so it gets '
    + 'steeper the more you hold. Raising the Element itself lifts the ceiling.',
  ));
  content.appendChild(counterRow({
    name: 'Ki bought with XP',
    hint: `${kiPurchaseCost(state, data)} XP for the next`,
    get: () => state.advancementPurchases?.Ki ?? 0,
    set: (v) => {
      const have = state.advancementPurchases?.Ki ?? 0;
      if (v > have) buyAdvancementKi(state, data);
      else refundAdvancementKi(state);
    },
    min: 0,
    // Stop at the ceiling, or at what the remaining XP can actually pay for.
    max: () => {
      const have = state.advancementPurchases?.Ki ?? 0;
      const affordable = xpRemaining(state, data) >= kiPurchaseCost(state, data);
      return Math.min(maxBought, affordable ? have + 1 : have);
    },
    format: (v) => `${base + v}`,
    onChange: refresh,
  }));
  return details;
}
// Buying a Flaw off takes it down a Level at a time for XP. Only Flaws
// the character holds, or once held and bought off, are listed - the
// Flaws they never took are nothing to buy.
function flawsSection(state, data, refresh) {
  const cost = flawBuyoffCost(data);
  const { details, content } = sectionWrap(`Flaws (buy off one Level for ${cost} XP)`);
  const held = (state.flaws || []).filter((f) => f.level > 0 || Number(f.boughtOff) > 0);
  if (!held.length) {
    content.appendChild(briefDetail('No Flaws to buy off.'));
    return details;
  }
  content.appendChild(briefDetail(
    `Each Level of a Flaw granted one point at creation. Buying it back costs ${cost} XP a Level; `
    + 'the - takes the Flaw down a Level, the + undoes a buy-off and refunds the XP.',
  ));
  held.forEach((f) => {
    const row = counterRow({
      name: f.name,
      hint: f.level > 0 ? `${cost} XP to lower` : 'bought off',
      get: () => f.level,
      set: (v) => {
        if (v < f.level) buyOffFlawLevel(state, f.name);
        else restoreFlawLevel(state, f.name);
      },
      min: () => (f.level > 0 && xpRemaining(state, data) >= cost ? f.level - 1 : f.level),
      max: () => f.level + (Number(f.boughtOff) || 0),
      format: (v) => (v > 0 ? `Level ${v}` : 'gone'),
      onChange: refresh,
    });
    row.classList.add('counter-row-compact');
    content.appendChild(row);
  });
  return details;
}

// `xpField: false` leaves out the running-total box, for a page that
// takes XP its own way (the Owlbear Character Sheet adds a session's XP).
export default function buildAdvancementTab(state, data, refresh, { xpField = true } = {}) {
  const wrap = el('div', {});
  const summary = el('p', {});
  function updateSummary() {
    summary.textContent = `XP Earned: ${state.xpEarned}. Spent: ${xpSpent(state, data)}. Remaining: ${xpRemaining(state, data)}.`;
  }
  updateSummary();

  if (!xpField) {
    if (!refresh) return [wrap];
    wrap.append(
      attributesSection(state, data, refresh),
      skillsSection(state, data, refresh),
      resourcesSection(state, data, refresh),
      giftsSection(state, data, refresh),
      boonsSection(state, data, refresh),
      kiSection(state, data, refresh),
      flawsSection(state, data, refresh),
    );
    return [wrap];
  }

  wrap.append(
    el('h2', {}, 'Advancement'),
    el('p', { class: 'detail' }, 'Post-creation XP spend, see the Advancement Reference doc. Award XP per session at the table, enter the running total below.'),
    el('div', { class: 'field' }, [
      el('label', {}, 'XP Earned (total, running)'),
      el('input', {
        type: 'number',
        min: '0',
        value: state.xpEarned,
        onInput: (e) => {
          state.xpEarned = Math.max(0, Number(e.target.value) || 0);
          refresh();
        },
      }),
    ]),
    summary,
  );

  if (!refresh) return [wrap];
  wrap.append(
    attributesSection(state, data, refresh),
    skillsSection(state, data, refresh),
    resourcesSection(state, data, refresh),
    giftsSection(state, data, refresh),
    boonsSection(state, data, refresh),
    kiSection(state, data, refresh),
    flawsSection(state, data, refresh),
  );
  return [wrap];
}
