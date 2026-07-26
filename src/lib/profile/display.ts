type NamedProfile = { display_name: string | null; email: string };

/** The name shown across the app shell: the student's preferred name, falling back to their email. */
export function getDisplayName(profile: NamedProfile): string {
  return profile.display_name?.trim() || profile.email;
}

/** Just the first token of the display name, for short greetings ("Welcome back, Jamie."). */
export function getFirstName(profile: NamedProfile): string {
  const name = getDisplayName(profile);
  const [first] = name.split(/\s+/).filter(Boolean);
  return first ?? name;
}
