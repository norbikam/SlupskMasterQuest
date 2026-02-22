import React, { useEffect } from 'react';
import * as Location from 'expo-location';
import { supabase } from '@/supabase';

export default function LocationTracker({ teamId }: { teamId: string }) {
  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    const startTracking = async () => {
      // 1. Prośba o uprawnienia
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      // 2. Śledzenie pozycji (aktualizacja co 30 metrów lub 30 sekund)
      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 30000, 
          distanceInterval: 30,
        },
        async (location) => {
          const { latitude, longitude } = location.coords;
          // 3. Wysyłamy do bazy
          await supabase
            .from('teams')
            .update({ latitude, longitude })
            .eq('id', teamId);
        }
      );
    };

    if (teamId) startTracking();

    return () => {
      if (subscription) subscription.remove();
    };
  }, [teamId]);

  return null; // Komponent działa w tle, nic nie wyświetla
}