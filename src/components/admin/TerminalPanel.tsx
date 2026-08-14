import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { RefreshCw } from "lucide-react";

import { Panel, SectionHeader, StatusBadge } from "./DashboardShared";

type Status = "conectando" | "ativo" | "desconectado";

export function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<Status>("conectando");
  const [sessionKey, setSessionKey] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
      lineHeight: 1.25,
      scrollback: 5000,
      theme: {
        background: "#0b0e14",
        foreground: "#e6e6e6",
        cursor: "#7aa2f7",
        cursorAccent: "#0b0e14",
        selectionBackground: "#33467c",
        black: "#0b0e14",
        red: "#f7768e",
        green: "#9ece6a",
        yellow: "#e0af68",
        blue: "#7aa2f7",
        magenta: "#bb9af7",
        cyan: "#7dcfff",
        white: "#e6e6e6",
        brightBlack: "#414868",
        brightRed: "#f7768e",
        brightGreen: "#9ece6a",
        brightYellow: "#e0af68",
        brightBlue: "#7aa2f7",
        brightMagenta: "#bb9af7",
        brightCyan: "#7dcfff",
        brightWhite: "#ffffff",
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    fit.fit();

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${protocol}://${window.location.host}/api/terminal`;
    const socket = new WebSocket(url);
    socketRef.current = socket;

    const sendResize = () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    };

    socket.onopen = () => {
      setStatus("ativo");
      sendResize();
      term.focus();
    };
    socket.onmessage = (event) => term.write(event.data);
    socket.onclose = () => setStatus("desconectado");
    socket.onerror = () => setStatus("desconectado");

    const dataDisposable = term.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(data);
    });
    const resizeObserver = new ResizeObserver(() => {
      fit.fit();
      sendResize();
    });
    resizeObserver.observe(container);
    sendResize();

    return () => {
      resizeObserver.disconnect();
      dataDisposable.dispose();
      socket.close();
      term.dispose();
    };
  }, [sessionKey]);

  const reconnect = () => {
    socketRef.current?.close();
    setSessionKey((value) => value + 1);
  };

  return (
    <section className="space-y-5">
      <SectionHeader
        title="Terminal"
        description="Acesso shell (bash) ao servidor desta máquina. Sessão autenticada com o administrador logado."
        action={
          <button
            onClick={reconnect}
            title="Reconectar"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/70 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-primary"
          >
            <RefreshCw className="size-3.5" />
            Reconectar
          </button>
        }
      />
      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-secondary/30 px-4 py-2">
          <p className="font-mono text-xs text-muted-foreground">
            root@{window.location.hostname} · /bin/bash
          </p>
          <StatusBadge active={status === "ativo"} label={status === "conectando" ? "Conectando..." : status === "ativo" ? "Ativo" : "Desconectado"} />
        </div>
        <div ref={containerRef} className="h-[calc(100vh-260px)] min-h-[420px] w-full bg-[#0b0e14] p-2" />
      </Panel>
    </section>
  );
}
