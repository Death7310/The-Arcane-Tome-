# Arcane Tome

An animated, auto-calculating character sheet for D&D 5e (2024 rules). Every number on it can be rolled. Spells and attacks play an effect and a sound that match their damage type.

## What it does

- **Stats in, bonuses out.** You enter ability scores, class levels, proficiencies and armor. The sheet works out the rest: modifiers, proficiency bonus, saves, all 18 skills (including expertise and Jack of All Trades), passive scores, initiative, AC (armor, shields, Unarmored Defense, Mage Armor), max HP, hit dice, spell save DC, spell attack, spell slots (single class, multiclass and Pact Magic), carrying capacity and jump distances. 2024 Exhaustion (−2 per level to d20 Tests, −5 ft Speed per level) is applied everywhere. Tap **Show the math** to see where each number comes from.
- **Dice roller on everything.** Checks, saves, skills, initiative, attacks, damage, spells, hit dice and death saves all roll. A floating chip sets Advantage/Disadvantage for the next d20, and an optional target AC in the Combat panel decides hit or miss. Critical hits double the damage dice.
- **Rolling dice.** Every roll throws dice that tumble and bounce on a velvet tray, then settle on the result before the card and the spell effect appear. Damage dice take their damage type's colour. A natural 20 ends in a critical moment themed to the action (fire for Fire Bolt, gold for a skill check); a natural 1 cracks the die.
- **Dice page.** Build a pool from d4–d100 with a modifier, type any notation (`4d6kh3`, `2d20kl1`, `8d10!` exploding, `6d10>=8` successes), save your own dice per character (a roll like `3d6+{DEX}`, or a die with custom faces like Sun / Rain / Storm), and see the full roll history.
- **Spell list.** Add spells from a quick-add library (SRD 5.2) or write your own. Cantrips scale at levels 5/11/17. Leveled spells can be upcast with any free slot. Slots, concentration and your Action, Bonus Action and Reaction are tracked for you.
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
| `src/fx/engine.ts` | Canvas particle engine (element × motion) |
| `src/fx/sound.ts` | Procedural Web Audio sound effects |
| `src/fx/dice.ts` | Rolling dice: physics, die shapes, critical and fumble moments |
| `src/state/table.ts` | What happens when you click: roll, apply to the sheet, play the effect |
| `src/state/storage.ts`, `src/state/pwa.ts` | Autosave, save points, backups and restore; offline install and updates |
| `src/state/native.ts` | Android app storage: save file, Documents backups, share sheet |
| `android/` | Capacitor Android project (icons, signing, permissions) |
| `src/components/` | Sheet panels, dice tray, dialogs |

## Roadmap

1. **More systems (Call of Cthulhu 7e, World of Darkness / Chronicles).** The dice engine already handles d100 and success-counting pools. The next step is a `GameSystem` interface, extracted once a second system shows what is truly shared, rather than guessed up front.
2. **World and combat builder.** Describe a setting or a combat system in plain language, and an LLM drafts a *declarative* system definition (stats, derived formulas, dice mechanics, actions). The app validates it against a schema before running it. Generated data can be checked and safely interpreted. Generated code can't.

## Licensing

Fonts (Alegreya SC, Alegreya Sans, IBM Plex Mono) are bundled from Fontsource under the SIL Open Font License 1.1. Game mechanics in `src/systems/dnd5e/` follow the System Reference Document 5.2 by Wizards of the Coast LLC, licensed under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/). Spell descriptions are short paraphrases, not rules text. Call of Cthulhu (Chaosium) and World of Darkness (Paradox Interactive) have no open rules licence. Support for them should ship mechanics only and let players enter their own content.
