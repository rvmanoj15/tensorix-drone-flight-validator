const express = require("express");
const turf = require("@turf/turf");
const app = express();

const yellowZone = turf.bboxPolygon([1, 1, 3, 3]);
const route = turf.lineString([[0, 2], [4, 2]]);
const path = require("node:path");

app.use("/leaflet", express.static(
  path.join(__dirname, "node_modules", "leaflet", "dist")
));

app.get("/api/demo-map", (req, res) => {
  res.json({ yellowZone, route });
});

app.get("/", (req, res) => {
  res.send(`
    <h1>TENSORIX Flight Plan Validator</h1>
    <p>Demo route A to B crosses Yellow zone Y1.</p>

     <link rel="stylesheet" href="/leaflet/leaflet.css">
<div id="map" style="height: 320px; max-width: 700px; background: #eef3f6;"></div>
<p id="map-status">Loading demo map...</p>
<script src="/leaflet/leaflet.js"></script>
<script>
  async function drawMap() {
    const response = await fetch("/api/demo-map");
    if (!response.ok) throw new Error("Map data unavailable");
    const { yellowZone, route } = await response.json();

    const map = L.map("map");
    const zoneLayer = L.geoJSON(yellowZone, {
      style: { color: "#946200", fillColor: "#ffd54f", fillOpacity: 0.6 }
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
          permanent: true, direction: "top"
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