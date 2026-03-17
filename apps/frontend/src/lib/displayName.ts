/**
 * Get display name for a user
 * Priority (current user): display_name > username > email username part
 * For other users: email username part
 */
export function getDisplayName(email: string): string {
  const normalizedEmail = (email || '').trim();
  const storedEmail = (localStorage.getItem('email') || '').trim();

  // If this is the current user, prefer profile display name
  if (storedEmail && normalizedEmail && storedEmail === normalizedEmail) {
    const profileName = (localStorage.getItem('display_name') || '').trim();
    if (profileName) return profileName;

    const storedUsername = (localStorage.getItem('username') || '').trim();
    if (storedUsername) return storedUsername;
  }

  // Fallback: email username part (before @)
  const emailUsername = normalizedEmail.split('@')[0];
  return emailUsername || normalizedEmail || 'User';
}

/**
 * Get initials from email or username
 */
export function getInitials(email: string): string {
  const displayName = getDisplayName(email);
  return displayName.substring(0, 2).toUpperCase();
}
