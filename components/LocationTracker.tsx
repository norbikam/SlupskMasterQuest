import React, { useEffect } from 'react';
import * as Location from 'expo-location';
import { supabase } from '@/supabase';

export default function LocationTracker({ teamId }: { teamId: string }) {
  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    const startTracking = async () => {
      // 1. Prośba o uprawnienia
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log("Brak uprawnień GPS dla Trackera");
        return;
      }

      // 2. WYMUSZENIE pierwszego zapisu (dzięki temu drużyna pojawi się na mapie od razu po zalogowaniu!)
      try {
        const initialLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await supabase
            .from('teams')
            .update({ latitude: initialLoc.coords.latitude, longitude: initialLoc.coords.longitude })
            .eq('id', teamId);
      } catch (e) {
        console.log("Błąd wstępnego pobrania lokalizacji:", e);
      }

      // 3. Śledzenie w tle (zmniejszono do 5 metrów dla lepszej płynności)
      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 10000, 
          distanceInterval: 5,
        },
        async (location) => {
          const { latitude, longitude } = location.coords;
          // Wysyłamy aktualizację do bazy
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

  return null; // Komponent działa w tle
}