import type { Actor } from './services/common';

/**
 * The app is used on one shared device without sign-in. Every action is
 * done by this single "device" actor, which has full rights (discounts,
 * voids, moving and cancelling orders). Its name is empty so no staff name
 * is shown on screens or printed on slips.
 */
export const DEVICE_ACTOR: Actor = { id: 'device', name: '', role: 'owner' };

export function useActor(): Actor {
  return DEVICE_ACTOR;
}

export function useSession() {
  return { actor: DEVICE_ACTOR, isOwner: true as const };
}
