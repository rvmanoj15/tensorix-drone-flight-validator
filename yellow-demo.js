const turf = require("@turf/turf");

const yellowZone = turf.bboxPolygon([1, 1, 3, 3]);
const route = turf.lineString([[0, 2], [4, 2]]);
const crossesYellow = turf.booleanIntersects(route, yellowZone);

for (const altitude of [90, 60, 59]) {
  if (crossesYellow && altitude >= 60) {
    console.log(`${altitude} m: Conditional - lower to 59 m.`);
  } else {
    console.log(`${altitude} m: Approve under the demo rule.`);
  }
}