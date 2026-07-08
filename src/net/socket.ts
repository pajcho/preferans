// WebSocket ka GameRoom DO-u: server gura redigovan view posle svake promene,
// potezi idu kroz WS sa reqId ↔ ack/error korelacijom. Automatski reconnect
// sa backoff-om + heartbeat („ping" → auto-odgovor „pong" bez buđenja DO-a).
import type { Action } from '@engine';
import type { ClientMessage, ServerMessage } from '@/protocol/messages';
import { apiBaseUrl } from './config';

export interface SocketHandlers {
  onMessage: (msg: ServerMessage) => void;
  onStatus: (connected: boolean) => void;
}

const HEARTBEAT_MS = 20_000;
const ACT_TIMEOUT_MS = 10_000;
const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 8_000;

interface PendingCall {
  resolve: () => void;
  reject: (e: Error) => void;
  timer: number;
}

export class GameSocket {
  private ws: WebSocket | null = null;
  private closed = false;
  private attempts = 0;
  private heartbeatTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private pending = new Map<string, PendingCall>();
  private reqCounter = 0;

  constructor(
    private readonly code: string,
    private readonly token: string,
    private readonly handlers: SocketHandlers,
  ) {
    this.open();
  }

  /** Potez preko WS-a; rešava se na ack, pada na error/timeout/prekid veze. */
  act(action: Action): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Nema veze sa serverom — pokušaj ponovo'));
        return;
      }
      this.reqCounter += 1;
      const reqId = `r${this.reqCounter}`;
      const timer = window.setTimeout(() => {
        this.pending.delete(reqId);
        reject(new Error('Server ne odgovara — pokušaj ponovo'));
      }, ACT_TIMEOUT_MS);
      this.pending.set(reqId, { resolve, reject, timer });
      this.sendMsg({ type: 'act', reqId, action });
    });
  }

  /** Zatraži svež view + presence (npr. posle greške poteza). */
  sync(): void {
    this.sendMsg({ type: 'sync' });
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  close(): void {
    this.closed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.rejectAll(new Error('Veza je zatvorena'));
    this.ws?.close();
    this.ws = null;
  }

  // ── interno ──

  private wsUrl(): string {
    const url = new URL(`${apiBaseUrl()}/api/games/${this.code}/ws`);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('token', this.token);
    return url.toString();
  }

  private open(): void {
    if (this.closed) return;
    const ws = new WebSocket(this.wsUrl());
    this.ws = ws;

    ws.onopen = () => {
      this.attempts = 0;
      this.startHeartbeat();
      this.handlers.onStatus(true);
    };
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string' || e.data === 'pong') return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(e.data) as ServerMessage;
      } catch {
        return;
      }
      this.settle(msg);
      this.handlers.onMessage(msg);
    };
    ws.onclose = () => {
      if (this.ws === ws) this.handleClose();
    };
    // onerror ne nosi ništa korisno — onclose uvek sledi
  }

  private handleClose(): void {
    this.stopHeartbeat();
    this.rejectAll(new Error('Veza je prekinuta'));
    this.ws = null;
    this.handlers.onStatus(false);
    if (this.closed) return;
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** this.attempts);
    this.attempts += 1;
    this.reconnectTimer = window.setTimeout(() => this.open(), delay);
  }

  private sendMsg(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Poveži ack/error sa čekajućim act pozivom. */
  private settle(msg: ServerMessage): void {
    if (msg.type !== 'ack' && !(msg.type === 'error' && msg.reqId)) return;
    const reqId = msg.type === 'ack' ? msg.reqId : msg.reqId!;
    const call = this.pending.get(reqId);
    if (!call) return;
    this.pending.delete(reqId);
    window.clearTimeout(call.timer);
    if (msg.type === 'ack') call.resolve();
    else call.reject(new Error(msg.message));
  }

  private rejectAll(error: Error): void {
    for (const call of this.pending.values()) {
      window.clearTimeout(call.timer);
      call.reject(error);
    }
    this.pending.clear();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send('ping');
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
