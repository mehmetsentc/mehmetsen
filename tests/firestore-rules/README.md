# Firestore rules runtime tests

Runs `../../firestore.rules` in the **local Firestore emulator** (demo project, no
credentials, no production access) and replays the SEC-CMS-ROLE-ESCALATION-1 attack
matrix plus the Phase 1 scoped-staff checks.

```bash
cd tests/firestore-rules
npm install            # isolated: does not touch the app package.json / lockfile
npm test               # firebase emulators:exec … node --test users.rules.test.mjs
```

Compare against the currently deployed rules (expected: escalation tests FAIL):

```bash
RULES_FILE=/path/to/deployed.rules npm test
```

Requires Java 11+ and network access to download the emulator once
(`storage.googleapis.com`).
