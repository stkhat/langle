# Bridge protocol golden envelopes

The JSON envelopes of the app's bridge (docs/specs/mobile-app.md "Bridge protocol"), one per file.
The TS tests (`src/app/bridge/protocol.test.ts`), JUnit and XCTest all parse and produce them, and `bad-version.json` must be rejected.
A change here changes all three sides.
