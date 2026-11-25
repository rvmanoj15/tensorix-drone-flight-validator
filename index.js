const express = require("express");
const turf = require("@turf/turf");
const path = require("node:path");

const app = express();

const yellowZone = turf.bboxPolygon([1, 1, 3, 3]);
const route = turf.lineString([[0, 2], [4, 2]]);
const yellowLimit = 60;

app.use("/leaflet", express.static(
  path.join(__dirname, "node_modules", "leaflet", "dist")
));

// Both the browser form and the API use this same Yellow-zone rule.
function checkYellowZone(points, altitude) {
  const crossingSegments = [];

  for (let i = 1; i < points.length; i++) {
    const segment = turf.lineString([points[i - 1], points[i]]);

    if (turf.booleanIntersects(segment, yellowZone)) {
      crossingSegments.push(i);
    }
  }

  if (crossingSegments.length > 0 && altitude >= yellowLimit) {
    return {
      verdict: "Conditional",
      reason: "Y1 requires a flight below 60 m.",
      crossingSegments,
      suggestedAltitude: 59
    };
  }

  return {
    verdict: "Approve",
    reason: crossingSegments.length > 0
      ? "The route crosses Y1 below 60 m."
      : "The route stays outside Y1.",
    crossingSegments,
    suggestedAltitude: null
  };
}

function validPoint(point) {
  return Array.isArray(point) &&
    point.length === 2 &&
    point.every(Number.isFinite) &&
    Math.abs(point[0]) <= 180 &&
    Math.abs(point[1]) <= 90;
}

app.get("/api/demo-map", (req, res) => {
  res.json({ yellowZone, route });
});

app.get("/", (req, res) => {
  res.send(`
    <!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>TENSORIX Flight Plan Validator</title>
      <link rel="stylesheet" href="/leaflet/leaflet.css">
    </head>
    <body>
      <h1>TENSORIX Flight Plan Validator</h1>
      <p>Demo route A to B crosses Yellow zone Y1.</p>

      <div id="map" style="height: 320px; max-width: 700px; background: #eef3f6;"></div>
      <p id="map-status">Loading demo map...</p>

      <form action="/validate" method="get">
        <label>Flight altitude in metres:
          <input name="altitude" type="number" min="0" step="any" value="90" required>
        </label>
        <button type="submit">Validate flight</button>
      </form>

      <script src="/leaflet/leaflet.js"></script>
      <script>
        async function drawMap() {
          const response = await fetch("/api/demo-map");
          if (!response.ok) throw new Error("Map data unavailable");

          const { yellowZone, route } = await response.json();
          const map = L.map("map");

          const zoneLayer = L.geoJSON(yellowZone, {
            style: {
              color: "#946200",
              fillColor: "#ffd54f",
              fillOpacity: 0.6
            }
          }).addTo(map);

          const routeLayer = L.geoJSON(route, {
            style: { color: "#185abc", weight: 4 }
          }).addTo(map);

          map.fitBounds(zoneLayer.getBounds().extend(routeLayer.getBounds()), {
            padding: [35, 35]
          });

          route.geometry.coordinates.forEach(([lng, lat], index) => {
            L.circleMarker([lat, lng], { radius: 5, color: "#17345c" })
              .addTo(map)
              .bindTooltip(index === 0 ? "A" : "B", {
                permanent: true,
                direction: "top"
              });
          });

          document.getElementById("map-status").textContent =
            "Blue line: flight A to B. Yellow area: Y1, altitude below 60 m.";
        }

        drawMap().catch(() => {
          document.getElementById("map-status").textContent =
            "Could not load the demo map. Check that the server is running.";
        });
      </script>
    </body>
    </html>
  `);
});

// The existing browser form checks the displayed A-B route.
app.get("/validate", (req, res) => {
  const input = req.query.altitude;

  if (typeof input !== "string" || input.trim() === "") {
    return res.status(400).send("Enter a valid altitude of zero or more metres.");
  }

  const altitude = Number(input);
  if (!Number.isFinite(altitude) || altitude < 0) {
    return res.status(400).send("Enter a valid altitude of zero or more metres.");
  }

  const result = checkYellowZone(route.geometry.coordinates, altitude);
  const suggestion = result.suggestedAltitude === null
    ? ""
    : " Try " + result.suggestedAltitude + " m.";

  res.send(`
    <h1>${result.verdict}: ${result.reason}${suggestion}</h1>
    <p>Altitude checked: ${altitude} m</p>
    <a href="/">Check another altitude</a>
  `);
});

// Check the points supplied by the pilot in [longitude, latitude] order.
app.post("/api/validate-route", express.json(), (req, res) => {
  const { points, altitude } = req.body || {};

  if (!Number.isFinite(altitude) || altitude < 0) {
    return res.status(400).json({
      error: "Enter a valid altitude in metres."
    });
  }

  if (!Array.isArray(points) || points.length < 2 || !points.every(validPoint)) {
    return res.status(400).json({
      error: "Provide at least two valid points in [longitude, latitude] order."
    });
  }

  res.json(checkYellowZone(points, altitude));
});

app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "The request body must be valid JSON." });
  }
  next(err);
});

app.listen(3000, "127.0.0.1", () => {
  console.log("Open http://127.0.0.1:3000 in Chrome");
});
app.get("/planner", (req, res) => {
  res.sendFile(path.join(__dirname, "planner.html"));
});