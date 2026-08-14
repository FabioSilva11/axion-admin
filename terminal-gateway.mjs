import http from "node:http";
import crypto from "node:crypto";
import { WebSocketServer } from "ws";
import pty from "node-pty";

const APP_PORT = Number(process.env.APP_PORT ?? 3001);
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.BIND_HOST ?? "0.0.0.0";
const SESSION_COOKIE = "axion_admin_session";
const TERMINAL_PATH = "/api/terminal";

function sign(payload) {
  const secret = process.env["ADMIN_SESSION_SECRET"];
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(value);
      } catch {
        out[key] = value;
      }
    }
  }
  return out;
}

function verifyAdminSession(req) {
  const secret = process.env["ADMIN_SESSION_SECRET"];
  if (!secret) return false;
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [username, expires, signature] = parts;
  if (!Number(expires) || Number(expires) < Date.now()) return false;
  return safeEqual(signature, sign(`${username}.${expires}`));
}

const server = http.createServer((req, res) => {
  const upstream = http.request(
    {
      protocol: "http:",
      hostname: "127.0.0.1",
      port: APP_PORT,
      method: req.method,
      path: req.url,
      headers: { ...req.headers },
    },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    }
    res.end("gateway: upstream (axion-server) indisponível");
  });
  req.pipe(upstream);
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });

server.on("upgrade", (req, socket, head) => {
  let pathname = "";
  try {
    pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  } catch {
    socket.destroy();
    return;
  }
  if (pathname !== TERMINAL_PATH) {
    socket.destroy();
    return;
  }
  if (!verifyAdminSession(req)) {
    console.log(`[terminal] conexão rejeitada (sem sessão válida) de ${req.socket.remoteAddress}`);
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

function heartbeat(ws) {
  if (!ws.isAlive) {
    ws.terminate();
    return;
  }
  ws.isAlive = false;
  ws.ping();
}

wss.on("connection", (ws, req) => {
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  console.log(`[terminal] shell iniciado para ${req.socket.remoteAddress}`);
  const shell = pty.spawn("/bin/bash", ["--login"], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: "/root",
    env: { ...process.env, TERM: "xterm-256color", LANG: "pt_BR.UTF-8" },
  });

  let closed = false;
  shell.onData((data) => {
    if (!closed && ws.readyState === ws.OPEN) ws.send(data);
  });
  shell.onExit(({ exitCode }) => {
    closed = true;
    console.log(`[terminal] shell encerrado (exit ${exitCode})`);
    if (ws.readyState === ws.OPEN) ws.close(1000, `exit ${exitCode}`);
  });

  ws.on("message", (data) => {
    const text = data.toString();
    if (text.charCodeAt(0) === 0x7b) {
      try {
        const message = JSON.parse(text);
        if (
          message.type === "resize" &&
          Number.isInteger(message.cols) &&
          Number.isInteger(message.rows)
        ) {
          shell.resize(Math.max(1, message.cols), Math.max(1, message.rows));
        }
      } catch {
        shell.write(data);
      }
      return;
    }
    shell.write(data);
  });
  ws.on("close", () => {
    closed = true;
    try {
      shell.kill();
    } catch {}
  });
  ws.on("error", () => {
    closed = true;
    try {
      shell.kill();
    } catch {}
  });
});

const interval = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

server.on("close", () => clearInterval(interval));

server.listen(PORT, HOST, () => {
  console.log(`[terminal] gateway ouvindo em ${HOST}:${PORT}, app upstream em 127.0.0.1:${APP_PORT}`);
});
