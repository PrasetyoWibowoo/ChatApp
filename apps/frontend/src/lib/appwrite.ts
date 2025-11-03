import { Client, Account, Databases, Storage, Realtime } from 'appwrite';

// Appwrite configuration
const client = new Client()
    .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID || '');

// Services
export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);
export const realtime = new Realtime(client);

// Database IDs (will be created in Appwrite Console)
export const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'chatapp';
export const COLLECTIONS = {
    USERS: 'users',
    ROOMS: 'rooms',
    MESSAGES: 'messages',
    ROOM_USERS: 'room_users',
    MESSAGE_READS: 'message_reads',
    MESSAGE_REACTIONS: 'message_reactions',
};

export default client;
