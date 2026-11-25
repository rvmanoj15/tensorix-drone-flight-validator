const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("TENSORIX Drone Flight Plan Validator is running.");
});

app.listen(3000, "127.0.0.1", () => {
  console.log("Open http://127.0.0.1:3000 in Chrome");
});