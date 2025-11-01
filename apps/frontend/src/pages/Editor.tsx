import { onCleanup, onMount, createSignal, createEffect } from 'solid-js';
import * as Y from 'yjs';
import { Editor as TipTapEditor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { YjsWsProvider } from '../collab/YjsWsProvider';

export default function Editor() {
  const id = (() => {
    const parts = window.location.pathname.split('/');
    return parts[2] || 'demo';
  })();
  const [status, setStatus] = createSignal('disconnected');
  let editor: TipTapEditor | null = null;
  let provider: YjsWsProvider | null = null;
  let container: HTMLDivElement | undefined;

  const [typing, setTyping] = createSignal(false);
  const [lastEvent, setLastEvent] = createSignal<string>('');
  let pulseTimer: any;
  let wsUrl = '';
  
  onMount(() => {
    if (!localStorage.getItem('token')) {
      window.location.href = '/login';
      return;
    }
    const ydoc = new Y.Doc();
    const onRemoteChange = () => {
      // Soft refresh: beri efek highlight pada editor-surface tanpa reload halaman
      console.log('[Editor] Remote change detected');
      if (container) {
        container.classList.add('pulse');
        clearTimeout(pulseTimer);
        pulseTimer = setTimeout(() => container && container.classList.remove('pulse'), 600);
      }
      setLastEvent('update');
    };
    const onRemoteTyping = () => {
      console.log('[Editor] Remote typing detected');
      setTyping(true);
      clearTimeout((window as any).__typingTimer);
      (window as any).__typingTimer = setTimeout(() => setTyping(false), 1200);
      setLastEvent('typing');
    };
    // Build WS URL from API base, dropping any path (e.g., '/api') to ensure correct '/ws/docs/:id' route
    const apiBase = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8080';
    try {
      const u = new URL(apiBase);
      u.protocol = u.protocol.replace('http', 'ws');
      u.pathname = '/ws/docs/' + id;
      u.search = '';
      wsUrl = u.toString();
    } catch {
      // Fallback simple construction
      wsUrl = (apiBase.startsWith('https') ? apiBase.replace('https', 'wss') : apiBase.replace('http', 'ws')) + `/ws/docs/${id}`;
    }
    console.log('[Editor] Connecting to WS:', wsUrl);
    provider = new YjsWsProvider(wsUrl, ydoc, setStatus, onRemoteChange, onRemoteTyping);

    editor = new TipTapEditor({
      element: container!,
      extensions: [
        StarterKit.configure({ history: false }),
        Collaboration.configure({ document: ydoc }),
        CollaborationCursor.configure({ provider, user: { name: 'You', color: '#f783ac' } })
      ],
      content: '',
      onUpdate: () => {}
    });
  });

  // Auto-resync once right after we connect, to ensure freshest state on first load
  let resyncedOnce = false;
  createEffect(() => {
    if (!resyncedOnce && status() === 'connected') {
      resyncedOnce = true;
      // Trigger the same logic as clicking Resync
      (async () => {
        try {
          const apiBase = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8080';
          let base = apiBase;
          try { const u = new URL(apiBase); u.pathname = ''; u.search = ''; base = u.toString().replace(/\/$/, ''); } catch {}
          const res = await fetch(base + `/api/docs/${id}/snapshot`);
          if (res.status === 200) {
            const j = await res.json();
            if (j.update && provider) provider.applySnapshot(j.update);
          }
        } catch {}
      })();
    }
  });

  onCleanup(() => {
    provider?.destroy();
    editor?.destroy();
    clearTimeout(pulseTimer);
  });

  const onH1 = () => editor?.chain().focus().toggleHeading({ level: 1 }).run();
  const onH2 = () => editor?.chain().focus().toggleHeading({ level: 2 }).run();
  const onBold = () => editor?.chain().focus().toggleBold().run();
  const onItalic = () => editor?.chain().focus().toggleItalic().run();
  const onBullet = () => editor?.chain().focus().toggleBulletList().run();
  const [shareMsg, setShareMsg] = createSignal<string | null>(null);
  const [resyncMsg, setResyncMsg] = createSignal<string | null>(null);
  const onShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const el = document.createElement('textarea');
        el.value = url; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el);
      }
      setShareMsg('Link copied');
    } catch {
      setShareMsg('Copy failed');
    }
    setTimeout(() => setShareMsg(null), 1600);
  };

  const onResync = () => {
    setResyncMsg('Resyncing…');
    // Try HTTP fetch of latest snapshot and apply it without rebroadcast.
    (async () => {
      try {
        const apiBase = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8080';
        // ensure we call the API base root (strip path)
        let base = apiBase;
        try { const u = new URL(apiBase); u.pathname = ''; u.search = ''; base = u.toString().replace(/\/$/, ''); } catch {}
        const res = await fetch(base + `/api/docs/${id}/snapshot`);
        if (res.status === 200) {
          const j = await res.json();
          if (j.update && provider) {
            provider.applySnapshot(j.update);
            setResyncMsg('Resynced');
          }
        } else {
          // fallback to reconnect if no snapshot or not found
          provider?.reconnect();
          setResyncMsg(res.status === 404 ? 'No server snapshot' : 'Resync failed');
        }
      } catch (e) {
        console.error('resync failed', e);
        try { provider?.reconnect(); } catch {}
        setResyncMsg('Resync error');
      }
      setTimeout(() => setResyncMsg(null), 1200);
    })();
  };

  return (
    <>
      <div class="topbar">
        <div class="topbar-inner">
          <div class="brand">Collab Notes</div>
          <div class="spacer" />
          <div class="status"><span class={"dot "+(status()==='connected'? 'ok':'')}></span>{status()} {typing() && <span class="muted" style={{'margin-left':'8px'}}>typing…</span>} {lastEvent() && <span class="muted" style={{'margin-left':'8px'}}>last: {lastEvent()}</span>}</div>
          <a class="btn btn-ghost" href="/">Home</a>
        </div>
      </div>
      <div class="shell">
        <div class="toolbar">
          <button class="btn" onClick={onH1}>H1</button>
          <button class="btn" onClick={onH2}>H2</button>
          <button class="btn" onClick={onBold}>Bold</button>
          <button class="btn" onClick={onItalic}>Italic</button>
          <button class="btn" onClick={onBullet}>Bullet</button>
          <div class="spacer" />
          <button class="btn" onClick={onResync}>Resync</button>
          <button class="btn" onClick={onShare}>Share</button>
          {resyncMsg() && <span class="muted" style={{ 'margin-left': '8px' }}>{resyncMsg()}</span>}
          {shareMsg() && <span class="muted" style={{ 'margin-left': '8px' }}>{shareMsg()}</span>}
        </div>
        <div class="editor-surface" ref={container} />
      </div>
    </>
  );
}
