# Arcane Tome

An animated, auto-calculating character sheet for D&D 5e (2024 rules). Every number on it can be rolled. Spells and attacks play an effect and a sound that match their damage type.

## What it does

- **Stats in, bonuses out.** You enter ability scores, class levels, proficiencies and armor. The sheet works out the rest: modifiers, proficiency bonus, saves, all 18 skills (including expertise and Jack of All Trades), passive scores, initiative, AC (armor, shields, Unarmored Defense, Mage Armor), max HP, hit dice, spell save DC, spell attack, spell slots (single class, multiclass and Pact Magic), carrying capacity and jump distances. 2024 Exhaustion (−2 per level to d20 Tests, −5 ft Speed per level) is applied everywhere. Tap **Show the math** to see where each number comes from.
- **Dice roller on everything.** Checks, saves, skills, initiative, attacks, damage, spells, hit dice and death saves all roll. A floating chip sets Advantage/Disadvantage for the next d20. Set a target AC in the Combat panel and the sheet calls HIT or MISS; without one it says **HIT?** and leaves the call to your DM, rather than assuming a hit. Critical hits double the damage dice.
- **Fair dice, and proof.** Every die comes from the device's cryptographic random generator (`crypto.getRandomValues`), with rejection sampling so each face is exactly equally likely (a plain `x % sides` would favour low faces slightly). **Settings → Are the dice fair?** rolls any die thousands of times, draws the spread, and runs a Pearson chi-square goodness-of-fit test on it. A hit-chance calculator shows the real odds of an attack against an AC, with Advantage or Disadvantage.
- **Rolling dice.** Every roll throws dice that tumble and bounce on a velvet tray, then settle on the result before the card and the spell effect appear. Damage dice take their damage type's colour. A natural 20 ends in a critical moment themed to the action (fire for Fire Bolt, gold for a skill check); a natural 1 cracks the die.
- **Hit by hit.** Attacks and spells count up on the tray. A sword, axe, rapier, spear, hammer, fist or arrow (picked from the weapon) strikes the d20, then each bonus (STR, PROF, magic), then the total and HIT, MISS or CRITICAL. The damage dice are thrown next, and the weapon strikes once per die. A spell's dice roll as orbs of its element (fireballs for Fireball) and burst one by one. Tap anywhere to skip to the result. It can be turned off, or sped up, in Settings.
- **Conditions and effects.** Toggle the 15 conditions and track Exhaustion and timed effects (Bless, Bane, Guidance, Haste, Shield, Shield of Faith, or your own). They apply themselves: Poisoned gives Disadvantage on attacks and checks, Paralyzed fails Strength and Dexterity saves, Bless adds 1d4, Advantage and Disadvantage cancel out, rounds count down each turn.
- **Import a character.** Read a sheet from a PDF (including fillable sheets and D&D Beyond exports), a Word or Google Doc (.docx), OpenDocument, text, web page or RTF, or paste what another AI wrote. Every page and every filled-in field is read: numbered weapon, equipment and spell rows, features and traits (bullets, D&D Beyond's `=== HEADINGS ===`), proficiencies and languages. Spells are matched against the full SRD and your rules library, and spells under each level heading get that level. Anything listed twice (on two pages, or as a trait and an action) comes in once. Magic weapons keep their full name ("Dragon Wing Shortbow"), with their base weapon's stats, the extra damage the sheet lists, and a magic bonus worked out from the sheet's attack bonus. You review what was found before anything is created. Mismatches (an AC or HP the math doesn't reach) are kept as overrides and pointed out. Everything is read on the device. Scans and photos aren't supported, because they would need text recognition. For unusual sheets there is a prompt to have an AI convert them first.
- **Equipment and magic items.** Inventory → **Item list** and Attacks → **More…** search the SRD 5.2.1's weapons, armor, gear, tools and magic items, plus any in your rules library. A magic weapon built on a base ("Flame Tongue", "+1 weapon") lets you pick the base, and comes with its extra damage and bonus. Armor can be worn straight away. **Paste** a weapon's or item's stat block, from a book, D&D Beyond or your own notes, and its damage, extra damage, properties, mastery, range, bonus, rarity and description land in the right fields. A weapon you already have can be filled in the same way. Each inventory item opens (▸) to its description and your notes.
- **Languages.** A page of its own lists every language you know, with its origin (from the SRD 5.2.1) and a short lore note on who speaks it and its character. Add several at once, invent your own and describe them, or replace any description to fit your world. The Character panel shows them too.
- **Your layout and pages.** Fold any panel away. Under **Arrange**, drag panels to new places or columns, drag the gap between columns to resize them, and drag a panel's bottom edge to set its height. Each panel's **On:** chooser moves it to another page, or puts it on several (Attacks on Stats as well as Combat, say). **Pages…** adds pages of your own (for homebrew rules or another game), renames and reorders them; on a phone they're tabs, and on a wider screen the pages you made get tabs beside the main sheet. Every drag also has an arrow or button, so it works by keyboard and on phones (WCAG 2.2 SC 2.5.7). The layout is kept per device; resetting it keeps the pages you made.
- **Tiles of your own.** **New tile** makes a panel with notes, trackers (current and maximum, with − and +, such as Sanity or Corruption) and roll buttons that take any dice formula with `{STR}`, `{PB}` and the like. Tiles belong to the character, so they come along in backups.
- **Portrait.** Add a picture of your character. It's shrunk on the device, to about 320 px, before it's saved.
- **Dice page.** Build a pool from d4–d100 with a modifier, type any notation (`4d6kh3`, `2d20kl1`, `8d10!` exploding, `6d10>=8` successes), save your own dice per character (a roll like `3d6+{DEX}`, or a die with custom faces like Sun / Rain / Storm), and see the full roll history.
- **Level up, level down.** **Level up** walks you through the next level: which class (multiclassing checks the 13-in-the-main-ability rule, with a house-rule override), hit points (average or roll), subclass, Ability Score Improvement or a feat, fighting style, Epic Boon. It shows what changes first: new features, spell slots, cantrips and prepared spells. Then the whole sheet updates, with class and subclass features (their uses and dice by level) from the SRD 5.2.1, saves and training for a new class, and HP. **Undo last level** puts everything back. Features you edited by hand are left alone.
- **Companions.** A small sheet for a familiar, a steed, a drake, a homunculus or anything you make up: AC, HP with damage and healing, speed, abilities, saves, skills and every action as a button that rolls. Expand it for the full stat block. Add one from the SRD creatures, paste a stat block (2014 or 2024 layout), or build one. Numbers can follow you as you level, such as `5 + 5 × {LEVEL:ranger}` HP or `{SPELLATK}` to hit.
- **Rules library.** Import rulebooks, supplements or your own game's rules (PDF, Word, text, web page). The text is kept on the device, split by its headings, and searchable. Classes (features by level, hit die, saves, subclasses), feats, spells, creatures and magic items found in it join the official ones in Level up, Add a spell, Add a companion and the item list. You review what was found before it is saved. The reader works from layout and wording, so it misses unusual formats: for those, there is a prompt to have an AI convert the document to the library's JSON format, which is validated on import. Packs can be turned off, exported, shared and are included in backups.
- **Spell list.** Add any spell from the SRD 5.2.1 (filtered by your classes, level and source, with the full description) or from your rules library, or write your own. The panel counts your cantrips and prepared spells against what your level allows. Cantrips scale at levels 5/11/17. Leveled spells can be upcast with any free slot. Slots, concentration and your Action, Bonus Action and Reaction are tracked for you.
- **Effects and sound.** Each effect combines an *element* (fire, cold, lightning, thunder, acid, poison, necrotic, radiant, force, psychic, slashing, piercing, bludgeoning, healing, arcane, shadow, nature) with a *motion* (bolt, ray, burst, cone, line, from above, aura, touch). Fireball flies out and explodes; Lightning Bolt cracks across the page; Ray of Frost freezes where it lands. Homebrew spells get a fitting animation by choosing an element and a motion. Combat actions (Move, Dash, Dodge, Hide…) have their own animations. All sounds are synthesized live with the Web Audio API, so there are no audio files.
- **Safe by default.** Screen flashes are capped at two per effect, spaced ≥350 ms apart and kept dim, which stays under the WCAG 2.2 limit of three flashes per second (SC 2.3.1). If your device asks for reduced motion, the sheet starts in reduced mode. Flashes, animations and sound can each be turned off.
- **Saving.** Every change autosaves. **Save** makes a save point you can load later, like a game save slot (loading one first saves where you are, so it can be undone). Backups can be saved as a file or shared, and restored on any device.
- **Multiple characters**, with JSON import/export.

## Use it offline

There are two standalone versions. Neither needs an account or a server once it's on your device, and neither sends your data anywhere.

| Version | Best for | How |
| --- | --- | --- |
| **Installed app** (PWA) | Phones and tablets; desktops too | Open **https://death7310.github.io/The-Arcane-Tome-/** once while online, then **Settings → Install** (Chrome, Edge, Android) or **Share → Add to Home Screen** (iPhone/iPad, in Safari). After that first visit it runs fully offline, and updates arrive only when you tap **Update now**. |
| **Android app** (APK) | Android phones and tablets | Download `arcane-tome.apk` from the site (Settings shows the link) and open it; Android asks once to allow installs from your browser. Saves to a file in the app's own storage; backups go to **Documents › Arcane Tome** or the share sheet. |
| **Single file** (`arcane-tome.html`) | Laptops and desktops | Build with `npm run build:single` and open `dist-single/index.html` by double-clicking. Fonts, code and sounds are all inside the one file. |

Your characters are stored on the device you use, in the browser's storage for that version. The installed app and the single file each keep their own saves. Use **Settings → Back up all characters** regularly, and **Restore from a backup** to move to another device. Restoring never overwrites a newer local edit: for each character, the copy edited most recently wins.

On iPhone and iPad, install the app rather than using it as a bookmarked website: Safari can delete a website's stored data after 7 days without a visit, but apps added to the Home Screen are exempt ([WebKit, 2020](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)).

### Hosting

Every push runs the tests and builds both the website and the Android app (see `.github/workflows/deploy.yml`). Pushes to `main` publish the site to GitHub Pages at https://death7310.github.io/The-Arcane-Tome-/, with the signed APK at `arcane-tome.apk`. Anyone with the link can use the app; each person's characters stay on their own device.

One-time setup: **Settings → Pages → Source: GitHub Actions**, and a repository secret **`ANDROID_SIGNING_KEY`** (`password:base64-of-the-.p12`). Android only installs an update over an app signed with the same key, so keep a private copy of that key: if it is lost, the next version can only be installed after uninstalling the old one, which deletes its saved characters.

## Run it

```bash
npm install
npm run dev          # local dev server
npm test             # rules + dice unit tests
npm run build        # static site in dist/
npm run build:single # one self-contained HTML file in dist-single/
npm run android:sync # web build for the app + copy into android/ (then open android/ in Android Studio)
```

The Android project in `android/` is a [Capacitor](https://capacitorjs.com) shell around the same web app, built with JDK 21 and the Android SDK (CI does this on every push).

## Code map

| Path | What lives there |
| --- | --- |
| `src/engine/dice.ts` | System-agnostic dice parser/roller (AST, keep/drop, exploding, success pools) |
| `src/systems/dnd5e/` | 5e data tables, character model, pure rules math, SRD spell library, example character |
| `src/systems/dnd5e/srd/`, `scripts/srd/build.mjs` | SRD 5.2.1 classes, subclasses, feats, spells, creatures, items and languages as JSON, generated from the Open Character Format pack (`node scripts/srd/build.mjs`) and loaded on first use |
| `src/systems/dnd5e/leveling.ts` | Level up and level down: plan, apply, undo; multiclass rules; keeping class features in step |
| `src/systems/dnd5e/formula.ts`, `statblock.ts` | Safe arithmetic for `{PB}`/`{LEVEL:x}`-style formulas; stat-block reading for companions |
| `src/systems/dnd5e/rulesdoc.ts`, `src/state/library.ts` | Rules library: reading a rules document or AI JSON, and the IndexedDB store of packs |
| `src/engine/fairness.ts` | Chi-square goodness-of-fit and hit-chance math behind **Are the dice fair?** |
| `src/systems/dnd5e/items.ts`, `src/components/Items.tsx` | Items: finding one by name (base, "+1", "Flame Tongue Longsword"), turning it into a weapon or inventory entry, reading a pasted stat block; the item picker |
| `src/fx/engine.ts` | Canvas particle engine (element × motion) |
| `src/fx/sound.ts` | Procedural Web Audio sound effects |
| `src/fx/dice.ts` | Rolling dice: physics, die shapes and spell orbs, phases, critical and fumble moments |
| `src/fx/strikes.ts`, `src/fx/ledger.ts` | The hit-by-hit tally: weapons and their motions, and the running count on the tray |
| `src/state/table.ts`, `src/state/tally.ts` | What happens when you click: roll, apply to the sheet, build the tally, play the effect |
| `src/systems/dnd5e/importer.ts`, `src/import/extract.ts` | Character import: text and form fields out of PDF/Word/ODT/HTML/RTF, then a forgiving reader |
| `src/state/layout.ts`, `src/components/Arrange.tsx`, `src/components/Pages.tsx` | Panel layout: columns, widths, heights, folding, and pages (built-in and your own, each with its own order); dragging and its button alternatives |
| `src/systems/dnd5e/languages.ts`, `src/components/Languages.tsx` | Languages: SRD origins and lore notes; the Languages page |
| `src/components/Tiles.tsx` | Tiles you make: notes, trackers and rolls |
| `src/state/storage.ts`, `src/state/pwa.ts` | Autosave, save points, backups and restore; offline install and updates |
| `src/state/native.ts` | Android app storage: save file, Documents backups, share sheet |
| `android/` | Capacitor Android project (icons, signing, permissions) |
| `src/components/` | Sheet panels, dice tray, dialogs |

## Roadmap

1. **More systems (Call of Cthulhu 7e, World of Darkness / Chronicles).** The dice engine already handles d100 and success-counting pools. The next step is a `GameSystem` interface, extracted once a second system shows what is truly shared, rather than guessed up front. Homebrew games that keep 5e's six abilities and d20 already work through the rules library; a game with its own stats or dice needs this step.
2. **World and combat builder.** Describe a setting or a combat system in plain language, and an LLM drafts a *declarative* system definition (stats, derived formulas, dice mechanics, actions). The app validates it against a schema before running it. Generated data can be checked and safely interpreted. Generated code can't.

## Licensing

Fonts (Alegreya SC, Alegreya Sans, IBM Plex Mono) are bundled from Fontsource under the SIL Open Font License 1.1. PDF reading uses Mozilla's pdf.js (Apache-2.0) and Word/OpenDocument reading uses fflate (MIT), both bundled so import works offline. This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode. The SRD data in `src/systems/dnd5e/srd/` is generated from [`@opencharacter/5e-srd-5.2`](https://opencharacterformat.org) (CC-BY-4.0); the app shows the same credit in Settings. Content you import into your rules library stays on your device; sharing an exported pack is up to you and the rights you hold in that content. Call of Cthulhu (Chaosium) and World of Darkness (Paradox Interactive) have no open rules licence. Support for them should ship mechanics only and let players enter their own content.
