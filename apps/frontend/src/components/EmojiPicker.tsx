import { createSignal, For } from 'solid-js';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

const EMOJI_CATEGORIES = {
  'Smileys': ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔'],
  'Gestures': ['👍', '👎', '👊', '✊', '🤛', '🤜', '🤞', '✌️', '🤟', '🤘', '👌', '🤌', '🤏', '👈', '👉', '👆', '👇', '☝️', '👋', '🤚', '🖐️', '✋', '🖖', '👏', '🙌', '👐', '🤲', '🤝', '🙏'],
  'Hearts': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟'],
  'Objects': ['💬', '💭', '🗨️', '🗯️', '💤', '💯', '💢', '💥', '💫', '💦', '💨', '🔥', '✨', '⭐', '🌟', '💥', '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🥈', '🥉'],
};

export default function EmojiPicker(props: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = createSignal('Smileys');

  return (
    <div class="emoji-picker-overlay" onClick={props.onClose}>
      <div class="emoji-picker" onClick={(e) => e.stopPropagation()}>
        <div class="emoji-picker-header">
          <For each={Object.keys(EMOJI_CATEGORIES)}>
            {(category) => (
              <button
                class={`emoji-category-btn ${activeCategory() === category ? 'active' : ''}`}
                onClick={() => setActiveCategory(category)}
              >
                {category}
              </button>
            )}
          </For>
        </div>
        <div class="emoji-picker-grid">
          <For each={EMOJI_CATEGORIES[activeCategory() as keyof typeof EMOJI_CATEGORIES]}>
            {(emoji) => (
              <button
                class="emoji-item"
                onClick={() => {
                  props.onSelect(emoji);
                  props.onClose();
                }}
              >
                {emoji}
              </button>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
