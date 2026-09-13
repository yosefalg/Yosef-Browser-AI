import { getSetting, setSetting } from './db';

const ONBOARDING_KEY = 'raid_onboarding_completed_v1';

export async function isOnboardingComplete() {
  return getSetting<boolean>(ONBOARDING_KEY, false);
}

export async function completeOnboarding() {
  await setSetting(ONBOARDING_KEY, true);
}
