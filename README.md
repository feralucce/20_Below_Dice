# 20 Below Dice

An [Owlbear Rodeo](https://www.owlbear.rodeo/) extension for [20 Below](https://20belowrpg.com/)'s dice mechanics. Doesn't reference a character sheet - just the raw rolls, entered by hand each time.

Covers four roll types, each in its own tab:

- **Skill** - the core 2d10 roll-under check (Attribute + Difficulty vs. a target), with Skill Tier (Untrained through Master), extra Advantage/Disadvantage, and your Klotho so a Lucky Number is flagged.
- **Combat** - to-hit for a Physical, Social or Mental attack (Moira can carry the last two) against the matching Defense, then the damage pool die by die against Soak, Presence or Psyche. A critical to-hit sets up the damage: half the dice through free, Klotho on the rest. Ki goes on the dice it can carry over the wall.
- **Init** - 1d10 + Initiative, or 2d10 keep the higher.
- **Character** - load a character exported from the creator to fill in numbers and track Vitals, Ki and Fate Tokens.

The rules engine in `lib/` is the character creator's own, copied from the main repo by `scripts/sync-dice.mjs` - edit it there, not here.

Every roll posts to a shared room log visible to everyone in the Owlbear Rodeo room, not just the roller.

## Installing

In Owlbear Rodeo, open the extensions menu and add a custom extension using this URL:

```
https://feralucce.github.io/20_Below_Dice/manifest.json
```

## Notes

- Works standalone outside Owlbear Rodeo too (opening `index.html` directly) - rolls just won't broadcast to a room; a "standalone" vs. "connected" indicator in the header shows which mode is active.
- Numbers can be typed by hand every time; loading a character only fills them in.
