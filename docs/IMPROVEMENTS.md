# Arcane Tome: audit and improvements

What was checked on 3 November 2026, what was fixed, and what could make the app better, in
order of value for the effort. Effort: **S** (an hour or two), **M** (a day or so), **L** (several days).

## How the app was checked

- **Every page, every control, at phone (390 px) and desktop (1366 px) widths**, by an automated
  crawl. It opened every folded panel and typed awkward values into every field (empty, "-",
  "abc", 999999, "1d", "{PB", -5, "1d1"). It picked the last option in every list and tapped every
  non-destructive button, including everything inside each dialog that opened and each of that
  dialog's tabs. After every step it checked for errors, a blank screen, a panel that crashed,
  sideways scrolling, controls a screen reader can't name, and duplicate element IDs.
  **Result after the fixes below: zero issues on every page and dialog at both widths.**
- **The code that the crawl can't reach**: saving and storage limits, the Android app's behaviour, roll
  maths with unfinished input, and state updates that could race a delete.
- 180 unit tests, the type checker, and the web, single-file and Android builds.

## Fixed in this round

| Problem | Effect before | Fix |
|---|---|---|
| Android **Back** button had no handling | Back closed the app outright, even with a dialog open | Back now closes the dialog on top, then leaves Arrange, then returns to the page you came from, and only then sends the app to the background (it doesn't kill it). Escape does the same for dialogs on a computer. |
| Browser storage can fill up (≈5 MB; 25 save points per character at ~50–80 KB each) | Changes silently stopped saving on the website | When full, the oldest save points (never characters, never a character's newest point) are dropped until the save fits, and a banner says so. The Android app also keeps its own save file, so it was never at risk. |
| Duplicate element IDs (the feat library and spell browser appear as tiles *and* in dialogs; feat/spell import and creation forms) | Labels pointed at the wrong copy, so screen readers announced nothing for those fields | Each copy now has its own IDs. |
| Ability scores looked like labels | Hard to see they can be edited | − / + buttons either side, a "score" caption and a hint. Any change flows through modifiers, saves, skills, attacks and spell DCs. Fits from 320 px phones up. |
| Two state updates assumed their item still existed (tile trackers, an effect's "one more round") | A quick double tap racing a delete could crash the sheet | They now skip quietly if the item is gone. |
| Infused Strikes had no quick way to pick its element | The damage type was buried in the companion editor | An element picker on the drake's card (Draconic Essence types first: acid, cold/ice, fire, lightning, poison; then every other type), and on the hit result itself if none is chosen yet. |

Fixed earlier this week: half-typed dice crashing the app (with a safety net that keeps any future
error inside one panel), and two-digit ability scores cut off in the companion editor on phones.

## Improvements, most valuable first

### Make it more dependable

1. **Run the crawl and the key journeys in CI (M).** CI runs unit tests and builds, but nothing
   taps through the app, which is how the dice-typing crash reached you. The crawl used for this
   audit, plus scripted journeys (cast a spell, take a feat, use Infused Strikes, import a sheet),
   would catch that class of bug before a release.
2. **Lint React hooks (S).** No linter is set up. `eslint-plugin-react-hooks` flags stale values
   in callbacks, the kind of bug that causes "it used an old number" reports.
3. **Copy error details (S).** When a panel shows its error message, add a button that copies the
   details, so a bug report includes exactly what broke.
4. **Update the CI actions (S).** GitHub warns that `actions/checkout@v4`, `setup-node@v4` and
   `upload-artifact@v4` run on deprecated Node 20, and `ubuntu-latest` is moving to Ubuntu 26.
   Moving to the current major versions avoids a surprise breakage.
5. **Dev-tool advisories (S).** `npm audit` reports moderate issues in build-time packages (glob,
   minimatch, deepmerge); nothing that ships in the app. Updating the dev tooling clears them.

### Make it faster

6. **Load the rules data only when needed (M).** At start-up the app loads all of the SRD: spells,
   creatures, items and classes (about 1.3 MB of script) for the catalog. Loading each part when
   it's first used (creatures when you add a companion, items when you open the item list) would
   make opening the app on a phone noticeably quicker.
7. **Split the main bundle (M).** The main script is ~760 KB before compression. Rarely used
   screens (character import, Level up, the rules library, the feat writer) could load on demand.
8. **Keep save points in IndexedDB (M).** The rules library already lives there, with far more room
   than the browser's 5 MB. Moving save points there would remove the storage ceiling altogether.

### Make it more effective at the table

9. ✅ **Done (3 November): one-tap concentration saves (S).** Taking damage while concentrating already shows "DC N
   Constitution save". A button there that rolls the save (with your save bonus and conditions)
   and ends the spell on a failure would save a step every fight.
10. **The drake's Bite essence damage (S–M).** (Partly done: the essence is now one setting on the companion. The Bite's extra damage waits until Ranger 7.) At 7th level the Bite adds 1d6 of the essence type,
    and at 15th 2d6. Companion actions hold one damage type, so the Bite rolls only its piercing
    damage. A second damage part on companion actions would cover this, and other multi-type attacks.
11. **Where each ability score comes from (M).** Show a score as base + increases (Level up's
    Ability Score Improvements and feats like Shadow-Touched, which the sheet already records) +
    hand edits. That makes a mismatch with your PDF obvious, like a WIS that should be 17.
12. ✅ **Done (3 November): targets and an initiative order (L).** Add foes from the SRD creature list (or a quick name +
    AC + HP) as targets. Attacks would then use the chosen target's AC and subtract damage from its HP.
    A turn order covering you, your companions and the foes would advance your and your companions' turns automatically.
13. ✅ **Done (7 November): undo (M).** An "undo last change" for slips like a wrong HP edit, quicker than a save point.
14. ✅ **Done (7 November): keep the roll history (S).** The roll history clears when the app reloads. Keeping the last
    ~50 rolls would let you look back at last session's crits.

### Make it more fun

15. ✅ **Done (7 November): haptics on Android (S).** A short buzz on a natural 20 and a thud on a natural 1, using
    Capacitor's Haptics plugin.
16. **Dice colours per character (S–M).** Pick a dice style (colour, material) for each character,
    and for the drake.
17. **Session highlights (M).** At the end of a session, a card summarising crits, total damage dealt
    and healed, and the biggest hit, from the roll history.
18. **A printable sheet (M).** A one-page summary to print or save as PDF for your DM.

### Larger, with trade-offs

19. **Sync between phone and computer (L).** Today each device keeps its own copy and you move it
    with backups. True sync needs either a server (an account, data leaving the device) or a file in
    a cloud drive you already use (Google Drive via its API, which needs an app registration).
    The second keeps your data in your own account.
20. **An iPhone app (L).** iOS installs only from the App Store (or TestFlight for testing), which needs an
    Apple Developer account ($99 a year). The website can be added to the iPhone home screen in the
    meantime.
