import type { CandidateContext } from "@cueline/shared";

// A fictional candidate for trying the app without pasting your own resume.
export const SAMPLE_CONTEXT: CandidateContext = {
  resume: `Alex Morgan, Software Engineer (3 years)

Experience
- Software Engineer, Lumen Health (2023 to now): built a real-time appointment dashboard in React and Node.js with WebSockets for 40 clinics; cut page load time by 45% with code splitting and caching; led the move from REST polling to WebSocket push, reducing server load by 30%.
- Junior Developer, Brightcart (2022 to 2023): built checkout features in Next.js and TypeScript; added Stripe payments; wrote Jest and Playwright tests that raised coverage from 40% to 75%.

Projects
- Meeting transcriber: browser audio over WebSockets to a speech-to-text API with live captions and AI summaries (Node.js, Gemini).
- AI resume reviewer: Next.js app that scores resumes against job descriptions using an LLM.

Skills: TypeScript, JavaScript, React, Next.js, Node.js, Express, PostgreSQL, MongoDB, Redis, WebSockets, Docker, AWS (EC2, S3), Git, REST API design, Jest, Playwright.
Education: B.Tech in Computer Science, 2022.`,
  jobDescription: `Software Engineer, Real-Time AI Products

We are building a platform that helps candidates during virtual interviews. You will:
- Build low-latency streaming pipelines (audio, speech-to-text, LLM) in Node.js/TypeScript or Python.
- Build responsive React/Next.js interfaces for live use.
- Own features end to end: design, implementation, testing and monitoring.
- Make sensible trade-offs between latency, cost and quality.

Requirements: 2+ years of professional software engineering; strong JavaScript/TypeScript; experience with WebSockets or real-time systems; experience integrating LLM APIs is a plus; clear communication.`,
};
