# Arcane Tome

An animated, auto-calculating character sheet for D&D 5e (2024 rules). Every number on it can be rolled. Spells and attacks play an effect and a sound that match their damage type.

## What it does

- **Stats in, bonuses out.** You enter ability scores, class levels, proficiencies and armor. The sheet works out the rest: modifiers, proficiency bonus, saves, all 18 skills (including expertise and Jack of All Trades), passive scores, initiative, AC (armor, shields, Unarmored Defense, Mage Armor), max HP, hit dice, spell save DC, spell attack, spell slots (single class, multiclass and Pact Magic), carrying capacity and jump distances. 2024 Exhaustion (−2 per level to d20 Tests, −5 ft Speed per level) is applied everywhere. Tap **Show the math** to see where each number comes from.
- **Dice roller on everything.** Checks, saves, skills, initiative, attacks, damage, spells, hit dice and death saves all roll. A one-shot Advantage/Disadvantage toggle and an optional target AC sit in the tray. Critical hits double the damage dice. The tray also takes free-form notation: `2d6+3`, `4d6kh3`, `2d20kl1`, `8d10!` (exploding), `6d10>=8` (count successes).
- **Spell list.** Add spells from a quick-add library (SRD 5.2) or write your own. Cantrips scale at levels 5/11/17. Leveled spells can be upcast with any free slot. Slots, concentration and your Action, Bonus Action and Reaction are tracked for you.
- **Effects and sound.** Each effect combines an *element* (fire, cold, lightning, thunder, acid, poison, necrotic, radiant, force, psychic, slashing, piercing, bludgeoning, healing, arcane, shadow, nature) with a *motion* (bolt, ray, burst, cone, line, from above, aura, touch). Fireball flies out and explodes; Lightning Bolt cracks across the page; Ray of Frost freezes where it lands. Homebrew spells get a fitting animation by choosing an element and a motion. Combat actions (Move, Dash, Dodge, Hide…) have their own animations. All sounds are synthesized live with the Web Audio API, so there are no audio files.
- **Safe by default.** Screen flashes are capped at two per effect, spaced ≥350 ms apart and kept dim, which stays under the WCAG 2.2 limit of three flashes per second (SC 2.3.1). If your device asks for reduced motion, the sheet starts in reduced mode. Flashes, animations and sound can each be turned off.
- **Multiple characters**, autosaved in this browser, with JSON import/export for backups.

## Use it offline

There are two standalone versions. Neither needs an account or a server once it's on your device, and neither sends your data anywhere.

| Version | Best for | How |
| --- | --- | --- |
| **Installed app** (PWA) | Phones and tablets; desktops too | Open **https://death7310.github.io/The-Arcane-Tome-/** once while online, then **Settings → Install** (Chrome, Edge, Android) or **Share → Add to Home Screen** (iPhone/iPad, in Safari). After that first visit it runs fully offline, and updates arrive only when you tap **Update now**. |
| **Single file** (`arcane-tome.html`) | Laptops and desktops | Build with `npm run build:single` and open `dist-single/index.html` by double-clicking. Fonts, code and sounds are all inside the one file. |

Your characters are stored on the device you use, in the browser's storage for that version. The installed app and the single file each keep their own saves. Use **Settings → Back up all characters** regularly, and **Restore from a backup** to move to another device. Restoring never overwrites a newer local edit: for each character, the copy edited most recently wins.

On iPhone and iPad, install the app rather than using it as a bookmarked website: Safari can delete a website's stored data after 7 days without a visit, but apps added to the Home Screen are exempt ([WebKit, 2020](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)).

### Hosting

Every push to `main` runs the tests and, if they pass, publishes the app to GitHub Pages at https://death7310.github.io/The-Arcane-Tome-/ (see `.github/workflows/deploy.yml`). The one-time setup is **Settings → Pages → Source: GitHub Actions**. Anyone with the link can use the app; each person's characters stay on their own device.

## Run it

```bash
npm install
npm run dev          # local dev server
npm test             # rules + dice unit tests
npm run build        # static site in dist/
npm run build:single # one self-contained HTML file in dist-single/
```

## Code map

| Path | What lives there |
| --- | --- |
| `src/engine/dice.ts` | System-agnostic dice parser/roller (AST, keep/drop, exploding, success pools) |
| `src/systems/dnd5e/` | 5e data tables, character model, pure rules math, SRD spell library, example character |
| `src/fx/engine.ts` | Canvas particle engine (element × motion) |
| `src/fx/sound.ts` | Procedural Web Audio sound effects |
| `src/state/table.ts` | What happens when you click: roll, apply to the sheet, play the effect |
| `src/state/storage.ts`, `src/state/pwa.ts` | Autosave, backups and restore; offline install and updates |
| `src/components/` | Sheet panels, dice tray, dialogs |

## Roadmap

1. **More systems (Call of Cthulhu 7e, World of Darkness / Chronicles).** The dice engine already handles d100 and success-counting pools. The next step is a `GameSystem` interface, extracted once a second system shows what is truly shared, rather than guessed up front.
2. **World and combat builder.** Describe a setting or a combat system in plain language, and an LLM drafts a *declarative* system definition (stats, derived formulas, dice mechanics, actions). The app validates it against a schema before running it. Generated data can be checked and safely interpreted. Generated code can't.

## Licensing

Fonts (Alegreya SC, Alegreya Sans, IBM Plex Mono) are bundled from Fontsource under the SIL Open Font License 1.1. Game mechanics in `src/systems/dnd5e/` follow the System Reference Document 5.2 by Wizards of the Coast LLC, licensed under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/). Spell descriptions are short paraphrases, not rules text. Call of Cthulhu (Chaosium) and World of Darkness (Paradox Interactive) have no open rules licence. Support for them should ship mechanics only and let players enter their own content.
