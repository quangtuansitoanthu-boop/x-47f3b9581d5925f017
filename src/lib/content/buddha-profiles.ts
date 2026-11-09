import profiles from '$lib/data/buddha-profiles.json';
import type { BuddhaProfile } from '$lib/types/buddha-profile';

export function getBuddhaProfile(id: string): BuddhaProfile | null {
  return profiles.find(profile => profile.id === id) ?? null;
}
