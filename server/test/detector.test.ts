import assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";
import { QuestionDetector, type Classify, type DetectedQuestion } from "../src/detect/detector.ts";

interface Recorded {
  questions: DetectedQuestion[];
  ignored: { text: string; reason: string }[];
  pending: string[];
}

const setup = (classify: Classify = async () => true) => {
  const rec: Recorded = { questions: [], ignored: [], pending: [] };
  const detector = new QuestionDetector(
    {
      onQuestion: (q) => rec.questions.push(q),
      onIgnored: (text, reason) => rec.ignored.push({ text, reason }),
      onPending: (text) => rec.pending.push(text),
    },
    { classify, holdMs: 1000, classifierTimeoutMs: 500 },
  );
  return { detector, rec };
};

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("QuestionDetector", () => {
  beforeEach(() => mock.timers.reset());

  it("emits a question when the turn ends", () => {
    const { detector, rec } = setup();
    detector.addFinal("What's your experience with Postgres?", 3.2);
    assert.equal(rec.questions.length, 0, "nothing before end of turn");
    detector.endOfTurn();
    assert.equal(rec.questions.length, 1);
    assert.equal(rec.questions[0]?.path, "heuristic");
    assert.equal(rec.questions[0]?.speechEnd, 3.2);
  });

  it("joins several final segments into one turn", () => {
    const { detector, rec } = setup();
    detector.addFinal("So we've been migrating our monolith.", 2);
    detector.addFinal("How would you split it into services?", 5);
    detector.endOfTurn();
    assert.equal(rec.questions.length, 1);
    assert.match(rec.questions[0]!.text, /monolith.*services\?/);
  });

  it("waits on an unfinished question and merges the continuation", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const { detector, rec } = setup();
    detector.addFinal("Tell me about a time when", 2);
    detector.endOfTurn();
    assert.equal(rec.pending.length, 1);
    assert.equal(rec.questions.length, 0);

    detector.addFinal("you disagreed with your manager.", 4);
    detector.endOfTurn();
    assert.equal(rec.questions.length, 1);
    assert.equal(rec.questions[0]?.text, "Tell me about a time when you disagreed with your manager.");
  });

  it("answers an unfinished question if nothing follows within the hold time", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const { detector, rec } = setup();
    detector.addFinal("Tell me about a time when", 2);
    detector.endOfTurn();
    mock.timers.tick(1000);
    assert.equal(rec.questions.length, 1);
  });

  it("ignores small talk and does not answer it", () => {
    const { detector, rec } = setup();
    detector.addFinal("Hi, can you hear me okay?", 1);
    detector.endOfTurn();
    assert.equal(rec.questions.length, 0);
    assert.equal(rec.ignored[0]?.reason, "small talk");
  });

  it("uses the classifier for ambiguous turns", async () => {
    const seen: string[] = [];
    const { detector, rec } = setup(async (text) => {
      seen.push(text);
      return true;
    });
    detector.addFinal("How did you handle the migration", 3);
    detector.endOfTurn();
    await flush();
    assert.deepEqual(seen, ["How did you handle the migration"]);
    assert.equal(rec.questions[0]?.path, "classifier");
  });

  it("drops a classifier result when the interviewer kept talking", async () => {
    let resolve!: (v: boolean) => void;
    const { detector, rec } = setup(() => new Promise<boolean>((r) => (resolve = r)));
    detector.addFinal("How did you handle the migration", 3);
    detector.endOfTurn();
    detector.addFinal("and what went wrong?", 5);
    resolve(true);
    await flush();
    assert.equal(rec.questions.length, 0, "stale classification is discarded");
    detector.endOfTurn();
    assert.equal(rec.questions.length, 1);
    assert.equal(rec.questions[0]?.text, "How did you handle the migration and what went wrong?");
  });

  it("falls back to the heuristic score when the classifier fails", async () => {
    const { detector, rec } = setup(async () => {
      throw new Error("timeout");
    });
    detector.addFinal("How did you handle the migration", 3);
    detector.endOfTurn();
    await flush();
    assert.equal(rec.questions.length, 1);
    assert.equal(rec.questions[0]?.path, "heuristic");
  });

  it("does not answer the same question twice in a row", () => {
    const { detector, rec } = setup();
    detector.addFinal("What is a closure?", 1);
    detector.endOfTurn();
    detector.addFinal("So, what is a closure?", 4);
    detector.endOfTurn();
    assert.equal(rec.questions.length, 1);
    assert.equal(rec.ignored.at(-1)?.reason, "repeat of the last question");
  });

  it("passes a preceding statement along as context", () => {
    const { detector, rec } = setup();
    detector.addFinal("Our office is near the station.", 1);
    detector.endOfTurn();
    detector.addFinal("How would you handle message ordering?", 4);
    detector.endOfTurn();
    assert.equal(rec.questions[0]?.preamble, "Our office is near the station.");
  });

  it("answers from interim text that stopped changing, without waiting for the STT", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const { detector, rec } = setup();
    detector.interim("s1", "What's the difference between", 1);
    detector.interim("s1", "What's the difference between TCP and UDP?", 2.4);
    mock.timers.tick(899);
    assert.equal(rec.questions.length, 0, "still inside the stability window");
    mock.timers.tick(1);
    assert.equal(rec.questions.length, 1);
    assert.equal(rec.questions[0]?.speechEnd, 2.4);

    // The late final for the same segment must not trigger a second answer
    detector.addFinal("What's the difference between TCP and UDP?", 2.4, "s1");
    detector.endOfTurn();
    assert.equal(rec.questions.length, 1);
  });

  it("does not close early on unstable or uncertain interim text", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const { detector, rec } = setup();
    detector.interim("s1", "Tell me about a time when", 1);
    mock.timers.tick(2000);
    assert.equal(rec.questions.length, 0, "trailing-off text waits for more");
  });

  it("merges an 'and …' continuation into the question it follows", () => {
    const { detector, rec } = setup();
    detector.addFinal("What's the difference between WebSockets and server-sent events?", 3);
    detector.endOfTurn();
    detector.addFinal("And when would you pick each one?", 6);
    detector.endOfTurn();
    assert.equal(rec.questions.length, 2);
    assert.equal(rec.questions[1]?.text, "What's the difference between WebSockets and server-sent events, and when would you pick each one?");
  });

  it("force() answers whatever was said so far", () => {
    const { detector, rec } = setup();
    detector.addFinal("Your thoughts on microservices", 2);
    assert.equal(detector.force(), true);
    assert.equal(rec.questions[0]?.path, "forced");
    assert.equal(detector.force(), false, "nothing left to force");
  });
});
