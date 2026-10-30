import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeTurn, fingerprint, stripFillers } from "../src/detect/heuristics.ts";

const verdict = (text: string) => analyzeTurn(text).verdict;

describe("analyzeTurn", () => {
  it("answers clear questions immediately", () => {
    for (const q of [
      "What is the difference between a process and a thread?",
      "Why do you want to work here?",
      "How would you design a rate limiter?",
      "Can you explain how React reconciliation works?",
      "Do you have any questions for us?",
      "Tell me about yourself.",
      "Walk me through a project you're proud of.",
      "I'd love to hear about a time you disagreed with your manager.",
      "Describe your experience with WebSockets.",
    ]) {
      assert.equal(verdict(q), "question", q);
    }
  });

  it("skips greetings, audio checks and acknowledgements", () => {
    for (const s of [
      "Hi Alex.",
      "Hello there!",
      "How are you doing today?",
      "Can you hear me okay?",
      "Great, thanks.",
      "Okay.",
      "Nice to meet you.",
      "Let's get started.",
      "Thank you for sharing that.",
      "Um, uh.",
      "That's really helpful.",
    ]) {
      assert.equal(verdict(s), "not_question", s);
    }
  });

  it("finds the question after small talk in the same turn", () => {
    const a = analyzeTurn("Hi, nice to meet you. So, tell me about yourself.");
    assert.equal(a.verdict, "question");
    assert.equal(a.cleaned, "tell me about yourself.");
  });

  it("waits when the speaker trails off mid-sentence", () => {
    assert.equal(verdict("Tell me about a time when"), "incomplete");
    assert.equal(verdict("So what would you do if the"), "incomplete");
    assert.equal(verdict("So tell me"), "incomplete");
  });

  it("accepts a trailing-off turn once the wait is over", () => {
    assert.equal(analyzeTurn("Tell me about a time when", { allowIncomplete: true }).verdict, "question");
  });

  it("hands question words without a question mark to the classifier", () => {
    assert.equal(verdict("How did you handle the migration"), "unsure");
  });

  it("treats interview-topic statements as unsure, plain statements as not questions", () => {
    assert.equal(verdict("I want you to think about your biggest challenge on that team."), "unsure");
    assert.equal(verdict("We're a team of twelve engineers based in Berlin."), "unsure");
    assert.equal(verdict("Our office is near the station."), "not_question");
  });
});

describe("stripFillers", () => {
  it("removes leading and inline fillers", () => {
    assert.equal(stripFillers("Um, so, okay, what is um a closure?"), "what is a closure?");
  });
});

describe("fingerprint", () => {
  it("matches the same question asked twice with different fillers", () => {
    assert.equal(fingerprint("So, what is a closure?"), fingerprint("What is a closure"));
  });
});
