import { describe, expect, it } from "vitest";
import { assignClusters, parseFeed } from "@/lib/ai/discover";
import { stripInvalidCitations, validateCitations } from "@/lib/ai/citations";
import { canonicalUrl, quoteInText } from "@/lib/text";
import { parseJsonLoose } from "@/lib/llm";

describe("quote verification", () => {
  const text = "The minister said, “We will never raise the fuel tax,” during the debate.";
  it("accepts verbatim quotes regardless of quote style or spacing", () => {
    expect(quoteInText("We will never   raise the fuel tax", text)).toBe(true);
  });
  it("rejects fabricated or paraphrased quotes", () => {
    expect(quoteInText("We might raise the fuel tax next year", text)).toBe(false);
  });
});

describe("clustering", () => {
  it("groups similar headlines and separates unrelated ones", () => {
    const { assignments, newClusters } = assignClusters([
      { key: "a", title: "Parliament passes new data protection bill after long debate" },
      { key: "b", title: "Data protection bill passes Parliament following debate" },
      { key: "c", title: "Cyclone warning issued for eastern coast" },
    ], []);
    expect(assignments.get("a")).toBe(assignments.get("b"));
    expect(assignments.get("c")).not.toBe(assignments.get("a"));
    expect(newClusters).toHaveLength(2);
  });
});

describe("feeds", () => {
  it("parses RSS and Atom", () => {
    const rss = `<rss><channel><item><title>Hello world story</title><link>https://x.com/a?utm_source=z</link><pubDate>Mon, 20 Oct 2025 10:00:00 GMT</pubDate><description>Sum</description></item></channel></rss>`;
    expect(parseFeed(rss, "X")[0]).toMatchObject({ title: "Hello world story", url: "https://x.com/a", publisher: "X" });
    const atom = `<feed><entry><title>Atom story here</title><link href="https://y.com/b"/><updated>2025-10-20T10:00:00Z</updated></entry></feed>`;
    expect(parseFeed(atom, "Y")[0].url).toBe("https://y.com/b");
  });
});

describe("citations", () => {
  const base = {
    whatHappened: "Something happened [S1].",
    whyItMatters: "It matters [S2].",
    background: "Earlier events.",
    conclusion: "Open.",
    timeline: [{ date: "2025-01-01", event: "e", sourceIds: ["S1"] }],
    supporting: [{ point: "p", sourceIds: ["S1"] }],
    contradicting: [],
    uncertain: [],
  };
  it("passes a valid draft", () => expect(validateCitations(base, ["S1", "S2"]).valid).toBe(true));
  it("flags unknown ids and missing citations", () => {
    const bad = { ...base, supporting: [{ point: "p", sourceIds: ["S9"] }], contradicting: [{ point: "q", sourceIds: [] }] };
    const r = validateCitations(bad, ["S1", "S2"]);
    expect(r.valid).toBe(false);
    expect(r.problems.join()).toMatch(/S9/);
    expect(stripInvalidCitations(bad, ["S1", "S2"]).supporting).toHaveLength(0);
  });
});

describe("misc", () => {
  it("canonicalises urls", () => expect(canonicalUrl("https://a.com/x/?utm_medium=1&id=2#frag")).toBe("https://a.com/x/?id=2"));
  it("parses fenced json", () => expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 }));
});