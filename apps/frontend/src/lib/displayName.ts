/**
 * Get display name for a user
 * Priority: username from localStorage > email username part > email
 */
export function getDisplayName(email: string): string {
  // Try to get username from localStorage first
  const storedUsername = localStorage.getItem('username');
  const storedEmail = localStorage.getItem('email');
  
  // If this is the current user and we have username, use it
  if (storedEmail === email && storedUsername) {
    return storedUsername;
  }
  
  // Otherwise, extract username from email (part before @)
  const emailUsername = email.split('@')[0];
  return emailUsername;
}

/**
 * Get initials from email or username
 */
export function getInitials(email: string): string {
  const displayName = getDisplayName(email);
  return displayName.substring(0, 2).toUpperCase();
}
