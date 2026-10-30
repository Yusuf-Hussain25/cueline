// Rule-based first pass over one interviewer turn. It is instant and free, so it decides the clear
// cases (most of them) and only hands genuinely ambiguous turns to the LLM classifier.
//
//   question      answer it now
//   incomplete    sounds cut off ("tell me about a time when…"): wait briefly for the rest
//   unsure        might be a question: ask the classifier
//   not_question  small talk, filler, acknowledgements or plain statements

export type Verdict = "question" | "incomplete" | "unsure" | "not_question";

export interface TurnAnalysis {
  verdict: Verdict;
  /** Short explanation shown in the UI ("small talk", "ends with ?", …). */
  reason: string;
  /** Turn with fillers and small-talk sentences removed: what gets answered. */
  cleaned: string;
  /** Sum of question signals. 0 = none, 3+ = strong. */
  score: number;
}

const FILLER_LEAD = /^(?:um+|uh+|er+|ah+|hmm+|mm+|okay|ok|so|well|alright|all right|right|and|now|yeah|yes|cool|great|hi|hello|hey)\b[,.!]?\s*/i;
/** "Hi Alex," or "Good morning," in front of the real sentence. */
const GREETING_LEAD = /^(?:hi|hello|hey|good (?:morning|afternoon|evening))(?:\s+[a-z]+)?\s*[,!.]\s*/i;
const FILLER_ANY = /\b(?:um+|uh+|erm|er|ah|hmm+)\b[,.]?\s*/gi;

/** Whole sentences that carry no question worth answering. */
const SMALL_TALK: RegExp[] = [
  /^(?:hi|hello|hey|good (?:morning|afternoon|evening))(?: there| everyone| all| [a-z]+)?$/,
  /^how(?:'s| is| are) (?:you|it going|everything|your day|things)(?: doing| going)?(?: today| so far)?$/,
  /^(?:can|could) you (?:hear|see) (?:me|us|my screen)(?: okay| ok| clearly| now| well| alright)?$/,
  /^(?:am i|are you) (?:audible|there|back)$/,
  /^(?:is|was) (?:my|the) (?:audio|video|connection) (?:okay|ok|fine|clear|good)$/,
  /^(?:it'?s )?(?:nice|great|good|lovely|a pleasure) (?:to )?(?:meet|meeting|see|seeing|talk|talking|speak|speaking)(?: to| with)? you(?: too| all)?(?: today)?$/,
  /^(?:thanks|thank you)(?: so much| very much)?(?: for .{0,80})?$/,
  /^(?:great|good|perfect|awesome|cool|nice|okay|ok|sure|alright|all right|got it|makes sense|i see|sounds good|no problem|no worries|right|yeah|yes|yep|wonderful|excellent|interesting|fair enough|understood|absolutely|exactly|fantastic|lovely|amazing)$/,
  /^(?:that'?s|that is|that was|this is) (?:great|good|helpful|interesting|fair|perfect|clear|fine|awesome|very helpful|really helpful|really interesting)$/,
  /^let'?s (?:get started|begin|start|move on|dive in|jump in|continue|proceed)$/,
  /^(?:(?:one|a|just a) (?:sec|second|moment|minute)|give me a (?:sec|second|moment|minute)|bear with me|hold on)$/,
  /^you'?re (?:on )?mute[d]?$/,
  /^(?:sorry|pardon|excuse me)(?: about that)?$/,
  /^(?:go ahead|please go ahead|carry on|please continue|take your time)$/,
];

const INTERROGATIVE = /^(?:what|why|how|when|where|which|who|whose|whom)\b/;
const AUXILIARY =
  /^(?:can|could|would|will|do|did|does|have|has|had|is|are|was|were|should|shall|may|might)\s+(?:you|your|we|i|there|it|this|that|they)\b/;
/** Interviewer prompts that are questions without a question mark. */
const PROMPT =
  /\b(?:tell (?:me|us)|walk (?:me|us) through|take (?:me|us) through|describe|explain|talk (?:me |us )?(?:about|through)|give (?:me|us) (?:an?|some) (?:example|overview|sense|idea|rundown)|share (?:an?|some) (?:example|time|story|experience)|elaborate|go deeper|expand on|dig into|introduce yourself|compare|i'?d (?:like|love) to (?:hear|know|understand)|i want to (?:hear|know|understand)|i'?m curious (?:about|how|what|why|whether|if))\b/;
const INTERVIEW_TOPIC =
  /\b(?:experience|project|team|challenge|design|architecture|difference|strength|weakness|salary|notice period|role|company|conflict|failure|mistake|proud|goal|years|background|manager|deadline|scale|performance|testing|debug|leadership|motivat)/;
/** Last words that always mean the speaker paused mid-sentence ("…a time when"). */
const TRAILING_INCOMPLETE = new Set([
  "and", "or", "but", "so", "because", "the", "a", "an", "like", "your", "my", "our", "their",
  "is", "are", "was", "were", "if", "that", "which", "when", "where", "how", "what", "why", "also",
  "then", "between", "versus", "vs",
]);
/** Prepositions end real questions too ("…a project you're proud of"), so only short turns count. */
const TRAILING_PREPOSITION = new Set(["of", "to", "for", "with", "about", "in", "on", "at", "into", "from", "by"]);

const words = (s: string) => s.split(/\s+/).filter(Boolean);

/** Strips fillers ("um", "so, okay") from the start and middle. */
export const stripFillers = (text: string): string => {
  let s = text.replace(FILLER_ANY, "").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 6; i++) {
    const next = s.replace(GREETING_LEAD, "").replace(FILLER_LEAD, "");
    if (next === s) break;
    s = next;
  }
  return s.replace(/^[,.!\s]+/, "").trim();
};

/** Sentences as Deepgram's smart formatting punctuated them. */
const sentences = (text: string) =>
  text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

const bare = (sentence: string) => stripFillers(sentence).toLowerCase().replace(/[.?!,]+$/g, "").trim();

const isSmallTalk = (sentence: string) => {
  const b = bare(sentence);
  return b === "" || SMALL_TALK.some((re) => re.test(b));
};

export const analyzeTurn = (raw: string, { allowIncomplete = false } = {}): TurnAnalysis => {
  const all = sentences(raw.trim());
  const core = all.filter((s) => !isSmallTalk(s));
  const cleaned = stripFillers(core.join(" "));
  const make = (verdict: Verdict, reason: string, score = 0): TurnAnalysis => ({ verdict, reason, cleaned, score });

  if (all.length === 0 || !all.some((s) => bare(s))) return make("not_question", "filler only");
  if (core.length === 0) return make("not_question", "small talk");

  const lower = cleaned.toLowerCase();
  const coreBare = core.map(bare);
  const hasQuestionMark = core.some((s) => s.endsWith("?"));
  const interrogative = coreBare.some((s) => INTERROGATIVE.test(s));
  const auxiliary = coreBare.some((s) => AUXILIARY.test(s));
  const prompt = PROMPT.test(lower);
  const score = (hasQuestionMark ? 3 : 0) + (interrogative ? 2 : 0) + (auxiliary ? 2 : 0) + (prompt ? 3 : 0);
  const count = words(cleaned).length;

  const lastWord = (lower.replace(/[^a-z'\s]/g, " ").trim().split(/\s+/).pop() ?? "").replace(/'/g, "");
  const trailsOff = !cleaned.endsWith("?") && (TRAILING_INCOMPLETE.has(lastWord) || (TRAILING_PREPOSITION.has(lastWord) && count <= 5));
  const endsCleanly = /[.?!]$/.test(cleaned) && !trailsOff;
  if (!allowIncomplete) {
    if (trailsOff) return make("incomplete", `trails off on "${lastWord}"`, score);
    if (score > 0 && count <= 2 && !hasQuestionMark) return make("incomplete", "too short to answer yet", score);
  }

  if (score >= 3 && count >= 2) {
    const reason = hasQuestionMark ? "ends with ?" : prompt ? "interview prompt" : "question words";
    return make("question", reason, score);
  }
  if (score >= 2) return make("unsure", "question words without a question mark", score);
  if (hasQuestionMark) return make("unsure", "very short question", score);
  if (count >= 5 && INTERVIEW_TOPIC.test(lower)) return make("unsure", "statement about an interview topic", score);
  return make("not_question", endsCleanly ? "statement" : "no question signal", score);
};

/** Lowercase letters only, for spotting the interviewer repeating the same question. */
export const fingerprint = (text: string) =>
  stripFillers(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
