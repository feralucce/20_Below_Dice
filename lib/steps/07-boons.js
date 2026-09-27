import { describeBoxes, el, flavourHtml, makeTwirl, purchasedPill, renderMarkdown } from '../ui.js';
import { describeFields, describePrompt } from '../describe-spec.js';
import { boonsPoolRemaining, addBoon, removeBoon, setBoonNote, boonNotes } from '../state.js';

// Shared by the Boons step (spend the Boons pool) and the Discretionary Points step (spend Discretionary
// points on a Boon at the converted rate) - `source` tags each purchase so
// removing it later refunds the right currency, `getRemaining`/`toCurrency`
// let the caller price it in whichever pool applies.
export function renderBoonPicker(container, ctx, allBoons, { source, getRemaining, toCurrency, currencyLabel }) {
  const { state, rerenderStep, rerenderPools, persist } = ctx;
  const selectedEl = el('div', { class: 'pick-list' });
  const listEl = el('div', { class: 'pick-list' });

  function renderSelected() {
    selectedEl.innerHTML = '';
    if (state.boons.length === 0) {
      selectedEl.appendChild(el('p', { class: 'detail' }, 'No Boons selected yet.'));
      return;
    }
    state.boons.forEach((b, i) => {
      const nameEl = el('span', {}, `${b.name} (${b.tier ?? ''} ${b.points} pts${b.source === 'discretionary' ? ', via Discretionary' : ''})`);
      const headerRow = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;' }, [
        nameEl,
        el('button', {
          type: 'button',
          text: 'Remove',
          onClick: () => {
            removeBoon(state, i);
            rerenderPools();
            rerenderStep();
          },
        }),
      ]);
      const boonData = allBoons.find((boon) => boon.name === b.name);
      const detailEl = el('div', {
        class: 'detail',
        html: boonData ? flavourHtml(boonData) + renderMarkdown(boonData.effect) : '',
      });
      // Keyed by slot as well as name: a repeatable Boon can be held twice,
      // and both copies are in this list.
      makeTwirl(nameEl, detailEl, { key: `boon-sel:${source}:${i}:${b.name}` });
      // Outside the twirl: what the player named is part of the character,
      // not part of the rules text, so it stays visible when the detail is
      // folded away.
      const fields = describeFields('boon', b.name, b);
      const noteEl = fields
        ? describeBoxes({
          count: fields,
          prompt: describePrompt('boon', b.name),
          notes: boonNotes(b),
          onChange: (slot, value) => {
            setBoonNote(state, i, slot, value);
            persist?.();
          },
        })
        : null;
      selectedEl.appendChild(el('div', { class: 'pick-card' },
        noteEl ? [headerRow, noteEl, detailEl] : [headerRow, detailEl]));
    });
  }

  function renderList() {
    listEl.innerHTML = '';
    const remaining = getRemaining();
    allBoons.forEach((boon) => {
      const alreadyTaken = state.boons.some((b) => b.name === boon.name);
      const disable = alreadyTaken && !boon.repeatable;
      const card = el('div', {
        class: alreadyTaken ? 'pick-card purchased' : 'pick-card',
      });
      const nameEl = el('span', {}, [
        boon.name,
        alreadyTaken ? purchasedPill() : null,
      ]);
      const headerRow = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap;' }, [
        nameEl,
      ]);
      const btnRow = el('div', { style: 'display:flex;gap:0.5rem;flex-wrap:wrap;' });
      boon.costs.forEach((cost) => {
        const currencyCost = toCurrency(cost.points);
        btnRow.appendChild(
          el('button', {
            type: 'button',
            text: `Add (${cost.tier ?? ''} ${currencyCost} ${currencyLabel})`,
            disabled: disable || currencyCost > remaining ? '' : undefined,
            onClick: () => {
              addBoon(state, boon.name, cost, source);
              rerenderPools();
              rerenderStep();
            },
          }),
        );
      });
      headerRow.appendChild(btnRow);
      const detailEl = el('div', {
        class: 'detail',
        html: flavourHtml(boon) + renderMarkdown(boon.effect),
      });
      makeTwirl(nameEl, detailEl, { key: `boon-avail:${source}:${boon.name}` });
      card.append(headerRow, detailEl);
      listEl.appendChild(card);
    });
  }

  container.append(el('h3', {}, 'Selected Boons'), selectedEl, el('h3', {}, 'Available Boons'), listEl);
  renderSelected();
  renderList();
}

export default {
  id: 'boons',
  title: 'Boons',
  render(container, ctx) {
    const { state, data } = ctx;
    container.append(
      el('h2', {}, 'Boons'),
      el('p', {}, `Spend a ${data.boonsPoolTotal}-point pool. Remaining: ${boonsPoolRemaining(state, data)}. Anything left unspent converts 1:1 into Discretionary points (the Discretionary Points step).`),
    );
    renderBoonPicker(container, ctx, data.boons, {
      source: 'pool',
      getRemaining: () => boonsPoolRemaining(state, data),
      toCurrency: (points) => points,
      currencyLabel: 'pts',
    });
  },
};
