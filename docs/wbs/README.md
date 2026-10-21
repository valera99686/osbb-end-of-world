# WBS of the project «ОСББ кінця світу» (Doomsday H.O.A.)

The work breakdown of the «Конкурс проєктів 2026». It is the same table as the team tab **«осбб кінця світу»** in the contest's WBS sheet (https://docs.google.com/spreadsheets/d/1m72iW0zqWHDoW4mTo-yYRNdmRpq35TNwi2tkIOe7kgk/edit?gid=1627906229): epics, tasks of 4-8 hours, a description, a Definition of Done, an assignee, dates and an estimate in hours. [wbs.csv](wbs.csv) repeats the sheet's columns.

| Field | Value |
| --- | --- |
| Project | ОСББ кінця світу (Doomsday H.O.A.): a Ukrainian 2D roguelite, React + Canvas + Vite, offline Android APK |
| Development deadline | November 30, 2026 |
| Cross-testing | December 1-15, 2026 |
| Team | Povzun Valerii: development, design and QA (a one-person team, tab «Team 7») |
| Total | 110 h in 31 tasks; 15 done, 1 ready for review, 15 to do |

## Rules

- No task lives only in someone's head: everything that is done is in this table and on the board.
- A planned task is 4-8 hours (1-2 days); bigger ones are split. A finished task carries the time it really took, rounded up to half hours from the commit times: the work was much faster than the first plan said (the whole batch of October 15-16 took about three hours of wall-clock time, because generation and builds ran in the background).
- Statuses: **To Do → In Progress → Ready for Review → Done (checked)**. The sheet has no status column, so statuses live here.
- Done means the Definition of Done is met: code, tests, builds and documentation are green.
- Dates of finished tasks are the real ones (see git log); dates of the rest are the plan in [ROADMAP.md](../ROADMAP.md).
- Syncs: Monday, Wednesday and Friday at 17:00.

## What was done before the contest

| Version | What it brought | Status |
| --- | --- | --- |
| 0.10.0 | Settings, save export and import, 34 achievements, threat levels, daily and endless modes, procedural music, gamepad, vibration, enemy affixes, combo, events, living arenas, PWA | Done |
| 0.11.0 | Squad waves and lead aim, 28 perks, 6 weapon cores and 6 evolutions, house facade and turret, the «Case 04:17» story (dialogues, 12 clues, 3 endings), ending illustrations, full voice-over | Done |

## Tasks

### Epic 1. Delivery: web version and Android APK

Make the game open from a link in a browser and install as an offline Android APK without Google Play (a mandatory project requirement).

**Definition of Done:** The game opens from a public link, the current APK is attached to a GitHub Release, and the real-phone checklist is passed.

Oct 15, 2026 to Oct 23, 2026, 9.5 h.

| ID | Task | Description | Definition of Done | Start | End | Hours | Status |
| --- | --- | --- | --- | --- | --- | ---: | --- |
| 1.1 | Asset paths via BASE_URL | Replace hard-coded absolute paths (/art, /voice, manifest, service worker) with paths based on the build base and configure the Vite base. | The sub-path web build has no 404s in the Network tab; type check and tests pass; the APK build still works. | Oct 15, 2026 | Oct 15, 2026 | 0.5 | Done |
| 1.2 | Deploy to GitHub Pages | Build the web version and publish it to the gh-pages branch with one command; enable Pages in the repository. | https://valera99686.github.io/osbb-end-of-world/ opens the game; redeploying takes one command; the link is in the README. | Oct 15, 2026 | Oct 15, 2026 | 0.5 | Done |
| 1.3 | PWA and offline mode in the web version | Check the service worker and manifest under the sub-path, offline start and install to the home screen. | After the first load the game starts without a network in Chrome and on Android. | Oct 15, 2026 | Oct 20, 2026 | 1.5 | Ready for Review |
| 1.4 | Build the current APK and check it | Rebuild the APK with the build:android script after code changes; check its signature, size and version. | releases/osbb.apk is built, its signature is verified and versionName matches package.json. | Oct 15, 2026 | Oct 16, 2026 | 0.5 | Done |
| 1.5 | Publish the APK as a GitHub Release | Create a Release with the APK, its SHA-256 checksum and install instructions. | The Release page has the APK, its SHA-256 and install steps; the download link in the web version points to it; the downloaded file matches the checksum. | Oct 15, 2026 | Oct 16, 2026 | 0.5 | Done |
| 1.6 | Check the APK on a real phone | Install the APK on an Android device and run a checklist: start, saving, music and voices (autoplay in WebView), touch and gamepad, screen rotation, exit and return. | The checklist in docs/qa/android.md is filled in; every defect becomes an issue; no critical defects remain. | Oct 21, 2026 | Oct 23, 2026 | 6 | To Do |

### Epic 2. Sound, voice-over and story

Polish sound and story: music does not cover voices, the interface has sounds, every line is voiced, endings have achievements and Shelter reactions, bosses have portraits.

**Definition of Done:** Every story line is voiced, clicks have sound, new achievements and reactions work, and old saves still load.

Oct 16, 2026 to Oct 29, 2026, 10 h.

| ID | Task | Description | Definition of Done | Start | End | Hours | Status |
| --- | --- | --- | --- | --- | --- | ---: | --- |
| 2.1 | Duck music under voice | Web Audio music smoothly lowers while a voiced line plays and recovers after it. | During a voice line the music is at most 35% of its level and recovers within 0.6 s; music and voice settings stay independent; a unit test covers it. | Oct 16, 2026 | Oct 16, 2026 | 0.5 | Done |
| 2.2 | Interface click sounds | Wire the existing ui sound to buttons and links, respecting the SFX setting. | All menu, dialogue and perk buttons make a sound; muted SFX is fully silent; combat controls do not double it. | Oct 16, 2026 | Oct 16, 2026 | 0.5 | Done |
| 2.3 | Voice lines with attempt numbers | Pre-generate voice for lines with attempt and run numbers (1-8) and for boss taunts, and wire them in. | Files for numbers 1-8 and boss taunts exist in public/voice; the manifest is updated; voice.test.cjs checks coverage. | Oct 16, 2026 | Oct 16, 2026 | 1 | Done |
| 2.4 | Story achievements | Add achievements for clues found, each of the three endings and the full case file, and show them on the achievements page. | Seven new achievements with icon, text and condition; each is granted once; tests are updated; old saves still load. | Oct 16, 2026 | Oct 16, 2026 | 0.5 | Done |
| 2.5 | Shelter lines after endings | Add resident conversations that react to the endings the player has seen. | One new scene and three short voiced protocols per ending, shown only after that ending; story.test.cjs covers the conditions. | Oct 16, 2026 | Oct 16, 2026 | 0.5 | Done |
| 2.6 | Location boss portraits | Create nine boss portraits (three per location) for the battle intro card with GPT Image 2.5 Flare in the game style. | Nine webp files in public/art, shown on the intro card; prompts saved in docs/art-prompts. | Oct 16, 2026 | Oct 16, 2026 | 1 | Done |
| 2.7 | Recast voices after feedback | Collect feedback on the 13 voices and the emotion tags, change references in voices.json and regenerate the chosen lines. | Every voice is approved or replaced; regenerated files are committed. | Oct 27, 2026 | Oct 29, 2026 | 6 | To Do |

### Epic 3. Balance, quality and engineering

Check the game by hand, not only by automation, automate the checks and cut the weight of the project.

**Definition of Done:** A live-testing log exists, classmates have played the game, the balance audit and tests are green, accessibility is checked, every push is checked by CI, and the largest chunk is under 400 KB.

Oct 16, 2026 to Nov 18, 2026, 43 h.

| ID | Task | Description | Definition of Done | Start | End | Hours | Status |
| --- | --- | --- | --- | --- | --- | ---: | --- |
| 3.1 | CI on GitHub Actions | Add a workflow with type check, tests and build on every push and pull request. | The README has a status badge; the workflow goes red if the tests or the build fail. | Oct 16, 2026 | Oct 16, 2026 | 0.5 | Done |
| 3.2 | Repository cleanup | Remove the old site snapshot archives (.tools/osbb-site-v*.tar.gz); unused UI components and npm packages are kept on purpose. | Type check, tests, web and APK builds pass; about 835 MB of old archives is removed. | Oct 16, 2026 | Oct 16, 2026 | 0.5 | Done |
| 3.3 | Bundle splitting | Move the battle, workshop, tutorial, route map and story screens and the libraries into separate lazy chunks. | The largest chunk is under 400 KB (it was 790 KB, now 204 KB); the game starts without regressions; tests and the APK build are green. | Oct 16, 2026 | Oct 16, 2026 | 1 | Done |
| 3.4 | Playtest round with classmates | Share the web link with 3-5 classmates, collect their feedback in a short form (what was boring, unclear or broken) and triage it into issues. | At least 3 testers finished a raid; the feedback is collected in one place; every finding is filed as an issue with a priority. | Oct 26, 2026 | Nov 3, 2026 | 6 | To Do |
| 3.5 | Performance check on a low-end Android phone | Measure the frame rate and the load time of the APK on an older phone; note stutters in big fights and on the boss intro cards. | Frame rate and start-up time are noted for at least one low-end device; stutters are fixed or filed as issues. | Oct 28, 2026 | Oct 29, 2026 | 5 | To Do |
| 3.6 | Fixes from the playtest feedback | Fix the high-priority findings of the playtest and re-run the checks. | All high-priority findings are closed or consciously moved; tests and the balance audit are green; a new web build is deployed. | Nov 4, 2026 | Nov 6, 2026 | 8 | To Do |
| 3.7 | Three full playthroughs with a log | Play the game three times with different heroes and weapons, writing down attempts, deaths and boring places. | A dated log in docs/balance; each location has a completion time and a list of problems. | Nov 9, 2026 | Nov 11, 2026 | 8 | To Do |
| 3.8 | Balance fixes from the log | Tune enemy, perk and reward parameters according to the log. | The balance audit passes its gates; the new values are described in docs/balance; tests are green. | Nov 12, 2026 | Nov 16, 2026 | 8 | To Do |
| 3.9 | Accessibility check | Check colour-blind mode, text size, reduced flashes, gamepad and small 360x640 screens. | The checklist is passed; defects are fixed or filed as issues; before and after screenshots exist. | Nov 17, 2026 | Nov 18, 2026 | 6 | To Do |

### Epic 4. Documentation and release 1.0

Describe the project so that a new person can understand it, and ship version 1.0.0 by November 30.

**Definition of Done:** An architecture description, a README that gets a new developer running in 10 minutes, a player guide, and a v1.0.0 tag with the APK and the web version; development is finished by Nov 30.

Oct 16, 2026 to Nov 27, 2026, 19.5 h.

| ID | Task | Description | Definition of Done | Start | End | Hours | Status |
| --- | --- | --- | --- | --- | --- | ---: | --- |
| 4.1 | Technical documentation and architecture | Describe the architecture (engine, model, saves, story, voice-over, builds), the module diagram and the rules for adding content. | docs/architecture.md with a module diagram and recipes for adding an enemy, perk, achievement and line; linked from the README. | Oct 16, 2026 | Oct 16, 2026 | 1 | Done |
| 4.2 | README: run and build in 10 minutes | Write step-by-step instructions: clone, install, dev server, tests, web and APK builds, voice regeneration. | A new person clones the repository and runs the game locally in under 10 minutes by the README; verified from a clean clone. | Oct 16, 2026 | Oct 16, 2026 | 0.5 | Done |
| 4.3 | Player guide (PDF) | Write an illustrated guide: controls, perks, weapons, the house, modes and a spoiler-free story. | A PDF with at least 10 screenshots in docs, linked from the README; touch, keyboard and gamepad controls are described. | Nov 18, 2026 | Nov 20, 2026 | 6 | To Do |
| 4.4 | Feature freeze and release candidate | Prepare version 1.0.0-rc with the CHANGELOG, an updated README and the final balance. | Versions in package.json and Android match; the CHANGELOG is written; tag v1.0.0-rc; tasks of epics 1-3 are closed or consciously moved. | Nov 23, 2026 | Nov 24, 2026 | 6 | To Do |
| 4.5 | Final regression and the v1.0.0 tag | Run the full regression (tests, balance audit, web, APK), then tag and publish the Release. Nov 28-30 stay free as a buffer for the deadline. | All checks are green; the v1.0.0 Release has the APK and its SHA-256; the web version matches the release. | Nov 25, 2026 | Nov 27, 2026 | 6 | To Do |

### Epic 5. Cross-testing and defense

Cross-test with the other teams (Dec 1-15), fix what is found and prepare for the defense in front of the Nova Poshta representative.

**Definition of Done:** Cross-testing is done, critical and high bugs are closed, and the presentation and demo are ready and rehearsed on a clean device.

Dec 1, 2026 to Dec 15, 2026, 28 h.

| ID | Task | Description | Definition of Done | Start | End | Hours | Status |
| --- | --- | --- | --- | --- | --- | ---: | --- |
| 5.1 | Test cases for cross-testing | Write instructions and test cases for testers from other teams: the web link, the APK, a checklist and a bug report template. | docs/qa/crosstest.md exists; the web link works; an issue template for bugs exists. | Dec 1, 2026 | Dec 2, 2026 | 4 | To Do |
| 5.2 | Cross-test other teams projects | Test one or two projects of other teams and send structured bug reports. | At least 2 reports with steps, expected and actual result; the teams confirmed receipt. | Dec 3, 2026 | Dec 9, 2026 | 8 | To Do |
| 5.3 | Fixes after cross-testing | Go through the reports, fix the bugs and run the regression. | Critical and high bugs are closed; a new APK and web build are published; the CHANGELOG is updated. | Dec 10, 2026 | Dec 11, 2026 | 8 | To Do |
| 5.4 | Presentation and demo for the defense | Prepare slides (problem, idea, architecture, results, what is next), a 5-minute demo script and a recorded video as a backup. | The presentation and video are in the repository; the demo runs on a clean device without failures; answers to likely questions are prepared. | Dec 11, 2026 | Dec 15, 2026 | 8 | To Do |

## Current risks

- Sound and voice-over have not been checked on a real Android device yet: task 1.6.
- Balance has been checked by an automated audit only, not by a human playing through: task 3.7.
