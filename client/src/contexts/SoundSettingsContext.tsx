import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

interface SoundSettingsContextValue {
  enabled: boolean;
  volume: number;
  setEnabled: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
}

const SoundSettingsContext = createContext<SoundSettingsContextValue>({
  enabled: true,
  volume: 80,
  setEnabled: () => {},
  setVolume: () => {},
});

const STORAGE_KEY = "notification_sound_volume";

export function SoundSettingsProvider({ children }: { children: ReactNode }) {
  const { profile, updateProfile } = useAuth();
  const [enabled, setEnabledState] = useState(true);
  const [volume, setVolumeState] = useState(80);

  useEffect(() => {
    if (profile) {
      setEnabledState(profile.notif_order ?? true);
      const stored = localStorage.getItem(STORAGE_KEY);
      setVolumeState(stored ? parseInt(stored, 10) : 80);
    }
  }, [profile]);

  const setEnabled = useCallback(async (val: boolean) => {
    setEnabledState(val);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch("/api/auth/my-profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ notif_order: val }),
    });
    updateProfile({ notif_order: val });
  }, [updateProfile]);

  const setVolume = useCallback((val: number) => {
    setVolumeState(val);
    localStorage.setItem(STORAGE_KEY, String(val));
  }, []);

  return (
    <SoundSettingsContext.Provider value={{ enabled, volume, setEnabled, setVolume }}>
      {children}
    </SoundSettingsContext.Provider>
  );
}

export function useSoundSettings() {
  return useContext(SoundSettingsContext);
}
