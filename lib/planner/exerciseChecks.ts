import { loadAthleteProfile } from "@/lib/data/athleteProfileStore";

export async function getUnavailableEquipment(): Promise<string[]> {
  const profile = await loadAthleteProfile();
  return profile?.equipmentUnavailable ?? [];
}
