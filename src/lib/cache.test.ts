import { expect, test } from "vitest";
import { oldestHalf } from "./cache";

test("evicts the older half of translations only", () => {
  const items = {
    target: "th",
    "tr:c": { text: "c", at: 3 },
    "tr:a": { text: "a", at: 1 },
    "tr:d": { text: "d", at: 4 },
    "tr:b": { text: "b", at: 2 },
    "tr:e": { text: "e", at: 5 },
  };
  expect(oldestHalf(items)).toEqual(["tr:a", "tr:b", "tr:c"]);
});
