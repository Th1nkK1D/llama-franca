import { expect, test, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { evict, oldestHalf } from "./cache";
import { cacheLimitPref } from "./prefs";

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

test("evicts until translations fit the limit, all of them at 0", async () => {
  fakeBrowser.reset();
  const local = fakeBrowser.storage.local;
  vi.spyOn(local, "getBytesInUse").mockImplementation(async (keys) => {
    const items = await local.get(keys);
    return Object.values(items).reduce<number>((sum, v) => sum + JSON.stringify(v).length, 0);
  });
  const entries = Object.fromEntries(
    Array.from({ length: 8 }, (_, i) => [`tr:${i}`, { text: "x".repeat(100), at: i }]),
  );
  await local.set({ ...entries, target: "th" });

  await cacheLimitPref.setValue(300 / 1024 / 1024);
  await evict();
  expect(Object.keys(await local.get(null)).sort()).toEqual([
    "cacheLimit",
    "target",
    "tr:6",
    "tr:7",
  ]);

  await cacheLimitPref.setValue(0);
  await evict();
  expect(Object.keys(await local.get(null)).sort()).toEqual(["cacheLimit", "target"]);
});
