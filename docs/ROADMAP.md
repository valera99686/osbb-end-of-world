# Roadmap: October 19 to December 15, 2026

The plan behind the team tab «осбб кінця світу» of the contest WBS sheet. Task ids (1.6, 3.4, ...) are the ones in [wbs/README.md](wbs/README.md), where the statuses live. Dates of finished tasks are the real ones; everything below is the plan.

## Where the project stands on October 19

- The game has been developed since September 8 (40 commits). Before the contest it already had 0.10 and 0.11: the story «Case 04:17», perks, weapon cores, endings and a full voice-over.
- The contest scope so far (October 15-16) is about 9.5 hours of effort in the table (rounded up to half hours; about three hours of wall-clock time, because voice generation and builds ran in the background): the web version, the GitHub Release with the APK, CI, lazy loading, sound polish, story achievements, boss portraits, documentation. Details are in [CHANGELOG.md](../CHANGELOG.md) (0.12.0 and 0.12.1).
- What nobody has done yet: the APK on a real phone, a live playthrough, feedback from other people. Most of the plan below is exactly that, because it cannot be automated.

## Calendar

| Week | Dates | Focus | Tasks | Needs |
| --- | --- | --- | --- | --- |
| 1 | Oct 19-23 | Prove that the APK works on a phone | 1.3 finish the offline check (to Oct 20), 1.6 real-phone checklist (Oct 21-23) | an Android phone |
| 2 | Oct 26-30 | First outside eyes, weak devices, voices | 3.4 playtest round starts (Oct 26), 3.5 low-end phone check (Oct 28-29), 2.7 recast voices (Oct 27-29) | 3-5 classmates, an older phone, a decision on the voice samples |
| 3 | Nov 2-6 | Act on the feedback | 3.4 closes (Nov 3), 3.6 playtest fixes (Nov 4-6) | the feedback itself |
| 4 | Nov 9-13 | Play it like a player | 3.7 three full playthroughs (Nov 9-11), 3.8 balance fixes start (Nov 12) | about 6 hours of play |
| 5 | Nov 16-20 | Polish and describe | 3.8 ends (Nov 16), 3.9 accessibility (Nov 17-18), 4.3 player guide (Nov 18-20) | screenshots from a phone |
| 6 | Nov 23-27 | Freeze and release | 4.4 release candidate (Nov 23-24), 4.5 regression and the v1.0.0 tag (Nov 25-27) | nothing new goes in after Nov 24 |
| | Nov 28-30 | Buffer | nothing is planned; the development deadline is Nov 30 | the course's final test is on Nov 28 |
| 7 | Dec 1-4 | Prepare cross-testing | 5.1 test cases (Dec 1-2), 5.2 starts (Dec 3) | the other teams' links |
| 8 | Dec 7-11 | Cross-test and fix | 5.2 ends (Dec 9), 5.3 fixes (Dec 10-11), 5.4 presentation starts (Dec 11) | reports from other teams |
| 9 | Dec 14-15 | Defense preparation | 5.4 ends (Dec 15) | a clean device for the demo |

Weekly load is about 6-10 hours, the heaviest weeks are 4 and 5. A task of 4-8 hours gets 2-3 calendar days so that it fits around lectures and other courses.

## Milestones

| | Date | Result | How it is checked |
| --- | --- | --- | --- |
| M1 | Oct 23 | The APK is verified on a real phone | the checklist in docs/qa/android.md is filled in, defects are issues |
| M2 | Nov 6 | The first playtest is digested | at least 3 testers, every finding has a priority, high ones are fixed |
| M3 | Nov 18 | Balance and accessibility are done | the audit gates pass, the accessibility checklist is passed |
| M4 | Nov 24 | Release candidate, feature freeze | version 1.0.0-rc, CHANGELOG, tag v1.0.0-rc |
| M5 | Nov 27 | v1.0.0 | a GitHub Release with the APK and its SHA-256, the web version matches |
| M6 | Dec 11 | Cross-testing is closed | critical and high bugs are fixed, a new build is published |
| M7 | Dec 15 | Ready for the defense | the presentation, the demo script and the backup video are in the repository |

## Weekly sync (Monday, Wednesday, Friday, 17:00)

Three short answers: what was finished since the last sync (with the task id), what is in progress now, what blocks it. The statuses in wbs/README.md change at the sync and not later; a task moves to Done only when its Definition of Done is met.

## Risks

| Risk | What helps |
| --- | --- |
| Power cuts and lost days | Nov 28-30 stay empty; every task has at least one spare day around it |
| The APK has only about 1.1 MiB of headroom (23.9 of 25 MiB) | no new art or voice before the release unless something of the same size is compressed or removed; `npm run build:android` stops at the limit |
| Sound in the Android WebView has never been tried on a device | it is the first thing task 1.6 checks; if autoplay is blocked, the voice starts after the first tap and the fix goes into 3.6 |
| Nobody has played the game except its author | the playtest (3.4) is scheduled early so that its findings still fit before the freeze |
| Voice generation needs the local graphics card | recasting (2.7) is planned for week 2; all generated files are committed, so the card is not needed afterwards |
| Other courses and tests | tasks are 2-3 days wide; 5 days of buffer before the deadline and a quiet Nov 28 |
| The cross-testing depends on other teams | 5.1 prepares everything on our side first; our own reports (5.2) go out even if replies are late |

## Backlog: only after the planned tasks are green

Not in the WBS and not promised. Each item is picked up only if a week has spare time and the APK budget allows it.

- Solid arena props that block movement (now only decor and explosive barrels).
- Protection against replaying the daily run to improve the score.
- An extra weapon core and its evolution.
- A short story epilogue per hero.
- English text and voice (large: about 4 weeks of work, so it stays a stretch idea).

Deliberately not planned: Google Play release, online leaderboards, accounts and telemetry. The game works offline and collects no data by design.

## Release checklist (v1.0.0)

- `npm run typecheck`, `npm test`, `npm run build` are green; the CI on main is green.
- The balance audit gates pass (`node scripts/balance-audit.cjs`).
- The APK is verified on a phone, is under 25 MiB, `versionName` equals the version in package.json.
- The Release has the APK and its SHA-256; the web version on GitHub Pages is the same build.
- README, CHANGELOG and docs/architecture.md describe the released state.
