import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAnswerMessages, parseClassifierReply } from "../src/answer/prompts.ts";

const context = { resume: "Built a WebSocket dashboard at Lumen Health.", jobDescription: "Real-time systems engineer." };

describe("buildAnswerMessages", () => {
  it("puts resume and job description in tagged blocks of the system prompt", () => {
    const [system] = buildAnswerMessages({ context, memory: [], question: "Why this role?", preamble: null });
    assert.equal(system?.role, "system");
    assert.match(system!.content, /<resume>\nBuilt a WebSocket dashboard at Lumen Health\.\n<\/resume>/);
    assert.match(system!.content, /<job_description>\nReal-time systems engineer\.\n<\/job_description>/);
    assert.match(system!.content, /Never invent them/);
  });

  it("asks for placeholders instead of invented details when there is no resume", () => {
    const [system] = buildAnswerMessages({ context: { resume: "", jobDescription: "" }, memory: [], question: "Tell me about yourself", preamble: null });
    assert.match(system!.content, /\[placeholders\]/);
    assert.doesNotMatch(system!.content, /<resume>\n/);
  });

  it("replays memory as real turns before the new question", () => {
    const messages = buildAnswerMessages({
      context,
      memory: [{ question: "What did you build at Lumen?", answer: "A real-time dashboard." }],
      question: "Can you go deeper on that?",
      preamble: "We use Kafka heavily.",
    });
    assert.deepEqual(
      messages.slice(1).map((m) => m.role),
      ["user", "assistant", "user"],
    );
    assert.match(messages.at(-1)!.content, /<earlier_context>[\s\S]*Kafka[\s\S]*Interviewer: Can you go deeper on that\?$/);
  });
});

describe("parseClassifierReply", () => {
  it("reads strict and slightly malformed JSON", () => {
    assert.equal(parseClassifierReply('{"question": true}'), true);
    assert.equal(parseClassifierReply('{"question": false}'), false);
    assert.equal(parseClassifierReply('Sure: {"question": true}'), true);
    assert.equal(parseClassifierReply("nonsense"), false);
  });
});
