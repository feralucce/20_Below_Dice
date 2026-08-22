# 20 Below Dice

An [Owlbear Rodeo](https://www.owlbear.rodeo/) extension for [20 Below](https://feralucce.github.io/20_Below/)'s dice mechanics. Doesn't reference a character sheet - just the raw rolls, entered by hand each time.

Covers four roll types, each in its own tab:

- **Skill** - the core 2d10 roll-under check (Attribute + Difficulty vs. a target), with the Element tickbox for flavor, Skill Tier (Untrained through Master, each applying its own Advantage/Disadvantage/crit-range rule), and extra Advantage/Disadvantage checkboxes for other sources that stack per the normal binary-cancel rule.
- **Damage** - a weapon's d10 pool resolved die-by-die against a target's Soak/Presence/Psyche, with optional Ki-boosted dice.
- **Init** - 1d10 + Initiative sub-stat.
- **Pool** - a contested Potence-style dice pool vs. a target's Soak.

Every roll posts to a shared room log visible to everyone in the Owlbear Rodeo room, not just the roller.

## Installing

In Owlbear Rodeo, open the extensions menu and add a custom extension using this URL:

```
https://feralucce.github.io/20_Below_Dice/manifest.json
```

## Notes

- Works standalone outside Owlbear Rodeo too (opening `index.html` directly) - rolls just won't broadcast to a room; a "standalone" vs. "connected" indicator in the header shows which mode is active.
- No character-sheet integration by design - the player types in their own numbers each time.
