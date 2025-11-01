import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness';

export class YjsWsProvider {
  private ws: WebSocket | null = null;
  private url: string;
  private ydoc: Y.Doc;
  private awareness: Awareness;
  private setStatus: (s: string) => void;
  private onRemoteChange?: () => void; // content updates
  private onRemoteTyping?: () => void; // awareness updates
  private backoff = 500;
  private destroyed = false;
  private originRemote = Symbol('remote');
  private clientId: string;

  constructor(url: string, ydoc: Y.Doc, setStatus: (s: string) => void, onRemoteChange?: () => void, onRemoteTyping?: () => void) {
    // Treat url as full ws/wss URL and append token robustly
    try {
      const u = new URL(url);
      const token = localStorage.getItem('token');
      if (token) u.searchParams.set('token', token);
      this.url = u.toString();
    } catch {
      // Fallback to raw url if URL parsing fails
      const token = localStorage.getItem('token');
      this.url = token ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : url;
    }
  this.clientId = (globalThis.crypto && 'randomUUID' in globalThis.crypto) ? (globalThis.crypto as any).randomUUID() : Math.random().toString(36).slice(2);
    this.ydoc = ydoc;
    this.awareness = new Awareness(ydoc);
    this.setStatus = setStatus;
  this.onRemoteChange = onRemoteChange;
  this.onRemoteTyping = onRemoteTyping;
  setStatus('connecting');
  this.connect();

    ydoc.on('update', (update: Uint8Array, origin: any) => {
      // Do not re-broadcast updates that originated from remote apply
      if (origin === this.originRemote) return;
      this.send({ type: 'update', update: this.b64(update), client_id: this.clientId });
      // Emit lightweight typing signal via awareness so peers can show indicator
      try { this.awareness.setLocalStateField('typing', Date.now()); } catch {}
    });

    this.awareness.on('update', (ev: any) => {
      const { added, updated, removed } = ev;
      const changedClients = added.concat(updated).concat(removed);
      const update = encodeAwarenessUpdate(this.awareness, changedClients);
      this.send({ type: 'awareness', update: this.b64(update), client_id: this.clientId });
    });
  }

  private b64(bytes: Uint8Array) {
    return btoa(String.fromCharCode(...bytes));
  }
  private fromB64(s: string) {
    const bin = atob(s);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  private connect() {
    if (this.destroyed) return;
    this.ws = new WebSocket(this.url, []);
    console.debug('[YjsWsProvider] connecting to', this.url);
    this.ws.onopen = () => {
      console.debug('[YjsWsProvider] connected');
      this.setStatus('connected');
      this.backoff = 500;
    };
    this.ws.onclose = () => {
      console.debug('[YjsWsProvider] disconnected');
      this.setStatus('disconnected');
      if (!this.destroyed) setTimeout(() => this.connect(), this.backoff = Math.min(this.backoff * 2, 8000));
    };
    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'update') {
          if (msg.sender && msg.sender === this.clientId) return; // ignore own echo
          Y.applyUpdate(this.ydoc, this.fromB64(msg.update), this.originRemote);
          console.debug('[YjsWsProvider] received update from', msg.sender);
          this.onRemoteChange?.();
        } else if (msg.type === 'snapshot') {
          console.debug('[YjsWsProvider] received snapshot');
          // apply snapshot and notify as remote change so editor can pulse
          Y.applyUpdate(this.ydoc, this.fromB64(msg.update), this.originRemote);
          this.onRemoteChange?.();
        } else if (msg.type === 'awareness') {
          applyAwarenessUpdate(this.awareness, this.fromB64(msg.update), this);
          if (!msg.sender || msg.sender !== this.clientId) {
            console.debug('[YjsWsProvider] received awareness from', msg.sender);
            this.onRemoteTyping?.();
          }
        }
      } catch {}
    };
  }

  private send(msg: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  destroy() {
    this.destroyed = true;
    if (this.ws) this.ws.close();
  }

  // Apply a full snapshot (base64-encoded update) without rebroadcasting
  applySnapshot(b64: string) {
    try {
      const bytes = this.fromB64(b64);
      Y.applyUpdate(this.ydoc, bytes, this.originRemote);
      this.onRemoteChange?.();
    } catch (e) {
      console.debug('[YjsWsProvider] applySnapshot failed', e);
    }
  }

  reconnect() {
    this.destroyed = false;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.close(); } catch {}
    }
    // small delay to let close settle
    setTimeout(() => this.connect(), 50);
  }
}
