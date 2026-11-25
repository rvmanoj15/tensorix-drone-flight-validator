# tensorix-drone-flight-validator
AVISHKAR’26 | Team TENSORIX | Team ID AV26-F36B19EA08 | Problem 24: Drone Flight Plan Validator with Airspace Zone Rules

## Complete local hackathon demo

Team TENSORIX · AV26-F36B19EA08 · Problem 24 · CHANDU KS, MANOJ RV, ANAND NG, HARISHA DS.

### Start on Windows
Extract the entire project ZIP to a short path such as C:\TENSORIX. Double-click Start-TENSORIX.cmd. Use Node.js 24 or newer (the team's Node 26 is suitable). Open the address printed by the launcher: http://127.0.0.1:3100/planner. Keep the terminal open. Choose pilot or admin and enter that role's password from the terminal. Passwords are generated anew on each launch unless you set PILOT_PASSWORD and ADMIN_PASSWORD environment variables. Do not commit passwords or local-data. From a source-only checkout, run npm ci and npm start.

### What the judges can try
1. Sign in as pilot. Load A–B and validate at 90 m. The server reports Conditional for segment 1 of Y1. At exactly 60 m it still reports Conditional. Click Apply suggestion and recheck. At 59 m the plan passes. Download the PDF and record the rule version.
2. Use Draw new route and click several map points. Cross the Red polygon and show Reject. Green permits up to and including 120 m; 121 m is Conditional. The app uses metres. For overlapping rules, Red takes priority and a suggested whole-metre altitude must satisfy all affected caps.
3. Sign out and sign in as admin. Select Y1 and Edit selected. Change the threshold to 50 and save. Add a new polygon using Draw new zone, enter a unique ID, choose its colour and a distance buffer in metres. A buffer extends the zone rule outside the polygon by that distance. Edit, redraw or delete a zone as needed.
4. Return to the pilot account. Check A–B at 59 m under the revised rules. Open the older approved PDF in Saved checks. It references the original rule version and saved route. Checks and zones survive stopping and restarting the server.

### Implementation
The full app uses Express and Leaflet on a local synthetic grid measured in metres. Node's built-in SQLite stores immutable snapshots of all zones on every admin change and records the rule version, waypoints, altitude and server verdict for each validation. Every segment is checked for intersection or proximity to each polygon. Turf handles planar topology and a point-to-segment distance calculation checks the edge buffer. PDFKit exports the stored approval record. Pilot and admin sessions are separate, role checks run on the server, and version checks protect against stale admin edits. Demo coordinates and results are synthetic and confer no real aviation authorization. Each role is a shared demo account. Use this local-only training application for the hackathon. The earlier index.js prototype is retained for reference.

### Tests
Run npm test. Tests start their own database and server, exercise zone boundaries, crossing segment identification, buffer rules, overlapping restrictions, login and permissions, zone changes, stale version rejection, PDF generation, and persistence after restart. They clean up the isolated database.

### Source and dependencies
Direct packages and purpose: Express (MIT) for HTTP routes, Leaflet (BSD-2-Clause) for map drawing, Turf.js (MIT) for polygon checks, PDFKit (MIT) for PDF generation. SQLite is public-domain software bundled with Node.js. Package-lock.json records package versions. Third-party notices accompany installed packages. Demo polygons are generated on first startup. No external tiles or API keys are required. PORT and TENSORIX_DATA can override the local port and database folder.

### Add the completed work to your existing GitHub checkout
In the source ZIP the file tensorix-completion.patch contains the changes from the team's Git commit 31941c3. Copy the patch to your existing checkout, then run git apply --check tensorix-completion.patch. If it succeeds run git apply tensorix-completion.patch, npm ci, and npm test. Review the changes and commit the relevant source files under your team's account. If the check reports conflicts, preserve your local changes before merging. Your existing account owns the repository; review hackathon rules for assistance and be ready to explain the implementation.
