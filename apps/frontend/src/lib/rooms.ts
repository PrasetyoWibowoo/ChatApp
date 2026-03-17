export interface StoredRoom {
  id: string;
  name: string;
  lastMessage?: string;
  timestamp?: string;
}

const STORAGE_KEY = 'myRooms';
const UPDATE_EVENT = 'chatapp:rooms-updated';

function normalizeRooms(rooms: StoredRoom[]): StoredRoom[] {
  const deduped = new Map<string, StoredRoom>();

  for (const room of rooms) {
    if (!room?.id) continue;

    const previous = deduped.get(room.id);
    deduped.set(room.id, {
      id: room.id,
      name: room.name?.trim() || previous?.name || room.id,
      lastMessage: room.lastMessage ?? previous?.lastMessage,
      timestamp: room.timestamp ?? previous?.timestamp,
    });
  }

  return Array.from(deduped.values()).sort((left, right) => {
    const leftTime = left.timestamp ? new Date(left.timestamp).getTime() : 0;
    const rightTime = right.timestamp ? new Date(right.timestamp).getTime() : 0;
    return rightTime - leftTime;
  });
}

function emitRoomsUpdated() {
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}

export function readStoredRooms(): StoredRoom[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return normalizeRooms(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function writeStoredRooms(rooms: StoredRoom[]): StoredRoom[] {
  const normalized = normalizeRooms(rooms);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  emitRoomsUpdated();
  return normalized;
}

export function upsertStoredRoom(
  room: StoredRoom,
  options?: { bumpTimestamp?: boolean }
): StoredRoom[] {
  const rooms = readStoredRooms();
  const existing = rooms.find((entry) => entry.id === room.id);
  const nextRoom: StoredRoom = {
    id: room.id,
    name: room.name?.trim() || existing?.name || room.id,
    lastMessage: room.lastMessage ?? existing?.lastMessage,
    timestamp: options?.bumpTimestamp === false
      ? (room.timestamp ?? existing?.timestamp)
      : (room.timestamp ?? new Date().toISOString()),
  };

  return writeStoredRooms([nextRoom, ...rooms.filter((entry) => entry.id !== room.id)]);
}

export function subscribeToStoredRooms(callback: (rooms: StoredRoom[]) => void): () => void {
  const handleUpdate = () => callback(readStoredRooms());
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      callback(readStoredRooms());
    }
  };

  window.addEventListener(UPDATE_EVENT, handleUpdate as EventListener);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(UPDATE_EVENT, handleUpdate as EventListener);
    window.removeEventListener('storage', handleStorage);
  };
}

export function getDefaultRoomName(roomId: string): string {
  if (roomId === 'general') return 'General Chat';
  if (roomId === 'team') return 'Team Chat';
  if (roomId === 'support') return 'Support';
  if (roomId.startsWith('dm_')) return 'Direct Message';
  return roomId;
}

export function getDmRoomId(uid1: string, uid2: string): string {
  return 'dm_' + [uid1, uid2].sort().join('_');
}

export function extractDmOtherUserId(roomId: string, myUserId: string): string | null {
  if (!roomId.startsWith('dm_')) return null;
  const ids = roomId.slice(3).split('_').filter(Boolean);
  return ids.find((id) => id !== myUserId) || null;
}