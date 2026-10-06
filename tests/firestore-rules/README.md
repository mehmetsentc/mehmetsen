# Firestore rules runtime tests

Runs `../../firestore.rules` in the **local Firestore emulator** (demo project, no
credentials, no production access) and replays the SEC-CMS-ROLE-ESCALATION-1 attack
matrix, the Phase 1 scoped-staff checks, and the SEC-UGC-INTEGRITY-REPAIR-1
newsDrafts checks (no direct-browser UGC create/read/update).

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

Test files share one emulator and call `clearFirestore()`, so they must run
sequentially (`--test-concurrency=1`, already in `npm test`).

Without firebase-tools (e.g. jar fetched manually; verify MD5
`9b43a6daa590678de9b7df6d68260395` for v1.19.8):

```bash
java -jar cloud-firestore-emulator-v1.19.8.jar --host=127.0.0.1 --port=8089 &
FIRESTORE_EMULATOR_HOST=127.0.0.1:8089 node --test --test-concurrency=1 \
  users.rules.test.mjs users.rules.supplement.test.mjs newsDrafts.ugc.rules.test.mjs
```
