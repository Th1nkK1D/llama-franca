import { expect, test } from "vitest";
import { buildPrompt } from "./ollama";
import { DEFAULT_PROMPT } from "./prefs";

test("fills placeholders once, leaving ones inside the text", () => {
  const prompt = buildPrompt(
    DEFAULT_PROMPT,
    { code: "en", name: "English" },
    { code: "th", name: "Thai" },
    "Hi {target} {unknown}",
  );
  expect(prompt)
    .toBe(`You are a professional English (en) to Thai (th) translator. Your goal is to accurately convey the meaning and nuances of the original English text while adhering to Thai grammar, vocabulary, and cultural sensitivities.
Produce only the Thai translation, without any additional explanations or commentary. Please translate the following English text into Thai:


Hi {target} {unknown}`);
});
