import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { ServerInfo } from "@cueline/shared";
import { config, configProblems } from "./config.ts";
import { createLogger } from "./lib/log.ts";
import { createLlmClient } from "./llm/index.ts";
import { Session } from "./session.ts";

const log = createLogger("server");
const llm = createLlmClient(config.llm);

const info: ServerInfo = {
  stt: { provider: "deepgram", model: config.stt.model, ready: Boolean(config.stt.apiKey) },
  llm: { provider: config.llm.provider, model: config.llm.model, classifierModel: config.llm.classifierModel, ready: Boolean(llm) },
  memoryTurns: config.memoryTurns,
  problems: configProblems(),
};

const isAllowedOrigin = (origin: string | undefined) => !origin || config.allowedOrigins.includes(origin);

// Plain HTTP only serves a health check; everything real happens on the WebSocket
const server = createServer((req, res) => {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, ...info }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({
  server,
  path: "/ws",
  maxPayload: 64 * 1024,
  // Only our web app may open a session (and spend the API quota)
  verifyClient: ({ origin }: { origin: string }) => isAllowedOrigin(origin),
});

let nextId = 1;
const alive = new WeakSet<WebSocket>();

wss.on("connection", (ws) => {
  const id = nextId++;
  const sessionLog = createLogger(`session ${id}`);
  const session = new Session(ws, { llm, info, log: sessionLog });
  alive.add(ws);
  sessionLog.info("connected");

  ws.on("pong", () => alive.add(ws));
  ws.on("message", (data, isBinary) => {
    try {
      if (isBinary) session.handleAudio(Buffer.isBuffer(data) ? data : Buffer.concat(data as Buffer[]));
      else session.handleText(data.toString());
    } catch (err) {
      sessionLog.error("message handler failed", { error: err instanceof Error ? err.message : String(err) });
    }
  });
  ws.on("close", () => {
    session.close();
    sessionLog.info("disconnected");
  });
  ws.on("error", (err) => sessionLog.warn("socket error", { error: err.message }));
});

// Drop connections whose browser tab vanished without closing the socket
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.has(ws)) {
      ws.terminate();
      continue;
    }
    alive.delete(ws);
    ws.ping();
  }
}, 30000);

server.listen(config.port, () => {
  log.info(`listening on http://localhost:${config.port} (WebSocket at /ws)`);
  log.info(`speech-to-text: deepgram ${config.stt.model} · llm: ${config.llm.provider} ${config.llm.model}`);
  for (const problem of info.problems) log.warn(problem);
});

const shutdown = () => {
  clearInterval(heartbeat);
  for (const ws of wss.clients) ws.close(1001, "server shutting down");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
