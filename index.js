const express = require("express");
const turf = require("@turf/turf");
const app = express();

const yellowZone = turf.bboxPolygon([1, 1, 3, 3]);
const route = turf.lineString([[0, 2], [4, 2]]);

app.get("/", (req, res) => {
  res.send(`
    <h1>TENSORIX Flight Plan Validator</h1>
    <p>Demo route A to B crosses Yellow zone Y1.</p>
    <form action="/validate" method="get">
      <label>Flight altitude in metres:
        <input name="altitude" type="number" min="0" step="any" value="90" required>
      </label>
      <button type="submit">Validate flight</button>
    </form>
  `);
});

app.get("/validate", (req, res) => {
  const input = req.query.altitude;
  const altitude = Number(input);

  if (typeof input !== "string" || input.trim() === "" ||
      !Number.isFinite(altitude) || altitude < 0) {
    return res.status(400).send("Enter a valid altitude of zero or more metres.");
  }

  const crossesYellow = turf.booleanIntersects(route, yellowZone);
  const message = crossesYellow && altitude >= 60
    ? "Conditional: Y1 requires an altitude below 60 m. Try 59 m."
    : "Approve: this route satisfies the demo altitude rule.";

  res.send(`
    <h1>${message}</h1>
    <p>Altitude checked: ${altitude} m</p>
    <a href="/">Check another altitude</a>
  `);
});

app.listen(3000, "127.0.0.1", () => {
  console.log("Open http://127.0.0.1:3000 in Chrome");
});