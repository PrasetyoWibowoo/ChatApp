-- Track when user last read messages in each room
CREATE TABLE IF NOT EXISTS room_users (
    user_id UUID NOT NULL REFERENCES users(id),
    room_id TEXT NOT NULL,
    last_read_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, room_id)
);
