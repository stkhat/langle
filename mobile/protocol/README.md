# Bridge protocol golden envelopes

The JSON envelopes of the app's bridge (docs/specs/mobile-app.md "Bridge protocol"), one per file.
The TS tests (`src/app/bridge/protocol.test.ts`), JUnit and XCTest all parse and produce them, and `bad-version.json` must be rejected.
A change here changes all three sides.

`filter-lists.json` is not an envelope: it is the ad-blocking filter lists both shells fetch (docs/specs/mobile-app.md "M6: ad blocking"), each with its fallback URLs and licence.
Lists marked `trusted` are parsed with the permission the trusted-* scriptlets need (`scripts/adblock-resources.ts`).
