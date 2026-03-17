import { createSignal, onMount } from 'solid-js';
import { upsertStoredRoom } from '../lib/rooms';

export default function CreateRoom() {
  const [roomName, setRoomName] = createSignal('');
  const [generatedLink, setGeneratedLink] = createSignal('');
  const [copied, setCopied] = createSignal(false);

  onMount(() => {
    // Check if user is logged in
    if (!localStorage.getItem('token')) {
      window.location.href = '/login';
    }
  });

  const generateRoomId = () => {
    // Generate unique room ID (simplified UUID-like)
    return 'room-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString(36);
  };

  const createRoom = (e: Event) => {
    e.preventDefault();
    
    const roomId = generateRoomId();
    const link = `${window.location.origin}/chat/${roomId}`;
    setGeneratedLink(link);

    const newRoom = {
      id: roomId,
      name: roomName().trim() || roomId,
      timestamp: new Date().toISOString(),
    };
    upsertStoredRoom(newRoom);
  };

  const copyLink = () => {
    if (generatedLink()) {
      navigator.clipboard.writeText(generatedLink());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const goToRoom = () => {
    if (generatedLink()) {
      const roomId = generatedLink().split('/chat/')[1];
      window.location.href = `/chat/${roomId}`;
    }
  };

  return (
    <div class="page-container">
      <div class="card" style="max-width: 500px; margin: 2rem auto;">
        <h1>Create Private Room</h1>
        <p style="color: #666; margin-bottom: 2rem;">
          Generate a unique link to share with others for a private chat room.
        </p>

        {!generatedLink() ? (
          <form onSubmit={createRoom}>
            <div style="margin-bottom: 1rem;">
              <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">
                Room Name (optional)
              </label>
              <input
                type="text"
                placeholder="e.g., Team Meeting, Project Discussion"
                value={roomName()}
                onInput={(e) => setRoomName(e.currentTarget.value)}
                style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px;"
              />
            </div>

            <button 
              type="submit"
              class="btn btn-primary"
              style="width: 100%;"
            >
              Generate Room Link
            </button>
          </form>
        ) : (
          <div>
            <div style="margin-bottom: 1rem;">
              <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">
                Your Private Room Link:
              </label>
              <div style="display: flex; gap: 0.5rem;">
                <input
                  type="text"
                  value={generatedLink()}
                  readonly
                  style="flex: 1; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; background: #f5f5f5;"
                />
                <button
                  onClick={copyLink}
                  class="btn btn-secondary"
                >
                  {copied() ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem;">
              <button
                onClick={goToRoom}
                class="btn btn-primary"
                style="flex: 1;"
              >
                Go to Room
              </button>
              <button
                onClick={() => setGeneratedLink('')}
                class="btn btn-ghost"
                style="flex: 1;"
              >
                Create Another
              </button>
            </div>

            <div style="margin-top: 1.5rem; padding: 1rem; background: #e3f2fd; border-radius: 4px; font-size: 0.9rem;">
              <strong>💡 Tip:</strong> Share this link with anyone you want to join this private room. 
              The room will be created when the first person joins.
            </div>
          </div>
        )}

        <div style="margin-top: 1.5rem; text-align: center;">
          <a href="/" class="btn btn-ghost">Back to Home</a>
        </div>
      </div>
    </div>
  );
}
