const assert = require("assert");
const path = require("path");
const { filterCountries } = require(path.join(__dirname, "..", "admin", "app.js"));

const rows = [
  { code: "CN", status: "resting" },
  { code: "US", status: "ok" },
  { code: "ZZ", status: "failed" },
  { code: "AQ", status: "empty" },
];

const onlyResting = filterCountries(rows, ["resting"]);
assert.strictEqual(onlyResting.length, 1);
assert.strictEqual(onlyResting[0].code, "CN");

const noFailed = filterCountries(rows, ["resting", "ok", "empty"]);
assert.strictEqual(noFailed.length, 3);
assert.ok(!noFailed.some(function (row) { return row.status === "failed"; }));

assert.strictEqual(filterCountries(rows, []).length, 0);
console.log("ok");
