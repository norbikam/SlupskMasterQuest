import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/supabase';
import { Team, Profile } from '@/types';

interface Props {
  userProfile: Profile;
  team: Team;
}

export default function TasksPlayerView({ userProfile, team }: Props) {
  const [activeTask, setActiveTask] = useState<any>(null);
  const [sideQuests, setSideQuests] = useState<any[]>([]);
  const [specialTasksList, setSpecialTasksList] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [isNear, setIsNear] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState('Szukam sygnału...');
  
  // Przechowujemy globalną pozycję gracza w locie
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);

  const [now, setNow] = useState(Date.now());

  // 1. Odświeżanie timera co 1 sekundę
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // 2. Ładowanie zadań i subskrypcje bazy danych
  useEffect(() => {
    loadTasks();
    
    const channelTT = supabase.channel('task_sync_tt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_tasks', filter: `team_id=eq.${team.id}` }, () => loadTasks())
      .subscribe();
      
    const channelTasks = supabase.channel('tasks_active_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => loadTasks())
      .subscribe();

    return () => {
      supabase.removeChannel(channelTT);
      supabase.removeChannel(channelTasks);
    };
  }, [team.id, team.aktywny_zestaw_id]);

  // 3. Moduł GPS działa ciągle i niezależnie w tle
  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    const initGPS = async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { 
        setGpsStatus('Brak uprawnień GPS'); 
        return; 
      }

      setGpsStatus('GPS Aktywny');

      // Wymuszenie błyskawicznego pobrania pozycji przy starcie
      try {
        const initialLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLocation(initialLoc);
      } catch (e) {
        console.log("Błąd wstępnej lokalizacji", e);
      }

      // Stała subskrypcja na zmiany pozycji co 5 metrów
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5 }, 
        (loc) => {
          setGpsStatus('GPS Aktywny');
          setUserLocation(loc);
        }
      );
    };

    initGPS();

    return () => {
      if (subscription) subscription.remove();
    };
  }, []);

  // 4. Błyskawiczne przeliczanie dystansu (uruchamia się, gdy gracz się ruszy LUB zmieni się zadanie)
  useEffect(() => {
    if (userLocation && activeTask?.latitude && activeTask?.longitude) {
      const d = calculateDistance(userLocation.coords.latitude, userLocation.coords.longitude, activeTask.latitude, activeTask.longitude);
      setDistance(Math.round(d));
      setIsNear(d <= (activeTask.promien_metry || 50));
    } else {
      setDistance(null);
    }
  }, [userLocation, activeTask]);

  const loadTasks = async () => {
    setLoading(true);

    // ZADANIA GŁÓWNE
    let mains: any[] = [];
    if (team.aktywny_zestaw_id) {
      const { data } = await supabase.from('tasks')
        .select('*, team_tasks(*)')
        .eq('zestaw_id', team.aktywny_zestaw_id)
        .eq('typ', 'glowne')
        .eq('is_active', true);
        
      if (data) mains = data.sort((a, b) => (a.kolejnosc || 0) - (b.kolejnosc || 0));
    }

    const next = mains.find(t => {
      const rel = t.team_tasks.find((r: any) => r.team_id === team.id);
      return rel?.status !== 'zaakceptowane' && rel?.status !== 'pominiete';
    });
    setActiveTask(next || null);

    // SIDEQUESTY
    const { data: sides } = await supabase.from('tasks')
      .select('*, team_tasks(*)')
      .eq('typ', 'sidequest')
      .eq('is_active', true);
      
    if (sides) setSideQuests(sides);

    // ZADANIA SPECJALNE
    const { data: specials } = await supabase.from('tasks')
      .select('*, team_tasks(*)')
      .eq('typ', 'special_event')
      .eq('is_active', true);
    if (specials) setSpecialTasksList(specials);

    setLoading(false);
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const handleStartTask = async () => {
    if (!isNear) return Alert.alert("Za daleko!", "Musisz być na miejscu, aby rozpocząć.");
    await supabase.from('team_tasks').upsert({
      team_id: team.id, task_id: activeTask.id, status: 'w_toku', rozpoczecie_zadania: new Date().toISOString()
    }, { onConflict: 'team_id,task_id' });
    loadTasks();
  };

  const handleAbandonMainTask = () => {
    const penalty = activeTask.kara_za_odrzucenie || 0;
    Alert.alert(
      "Odrzuć misję", 
      `Czy na pewno chcesz na stałe porzucić to zadanie? \n\nOtrzymasz karę punktową: -${penalty} PKT i od razu przejdziesz do kolejnej misji.`, 
      [
        { text: "Anuluj", style: "cancel" },
        { 
          text: "TAK, ODRZUĆ", 
          style: "destructive", 
          onPress: async () => {
            await supabase.from('team_tasks').upsert({
              team_id: team.id, task_id: activeTask.id, status: 'pominiete'
            }, { onConflict: 'team_id,task_id' });

            if (penalty > 0) {
              const { data: teamData } = await supabase.from('teams').select('punkty').eq('id', team.id).single();
              const currentPoints = teamData?.punkty || 0;
              await supabase.from('teams').update({ punkty: currentPoints - penalty }).eq('id', team.id);
            }

            loadTasks();
          }
        }
      ]
    );
  };

  const handleFileUpload = async (taskId: string) => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.4 });
    if (result.canceled) return;
    setUploadingId(taskId);

    try {
      const asset = result.assets[0];
      const fileExt = asset.uri.split('.').pop();
      const fileName = `${team.id}/${taskId}_${Date.now()}.${fileExt}`;
      const formData = new FormData();
      formData.append('file', { uri: Platform.OS === 'ios' ? asset.uri.replace('file://', '') : asset.uri, name: fileName, type: asset.type === 'video' ? 'video/mp4' : 'image/jpeg' } as any);

      await supabase.storage.from('evidence').upload(fileName, formData);
      const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(fileName);

      await supabase.from('team_tasks').upsert({ 
          team_id: team.id, task_id: taskId, status: 'do_oceny', 
          dowod_url: urlData.publicUrl, przeslano_zadanie: new Date().toISOString() 
        }, { onConflict: 'team_id,task_id' });

      Alert.alert('Sukces', 'Dowód wysłany! Czekaj na werdykt sędziego.');
      loadTasks();
    } catch (error: any) { Alert.alert('Błąd uploadu', error.message); } 
    finally { setUploadingId(null); }
  };

  const getTaskDuration = (tt: any) => {
    if (!tt?.rozpoczecie_zadania) return "00:00";
    const startMs = new Date(tt.rozpoczecie_zadania).getTime();
    const pausedMs = tt.suma_pauzy_ms || 0;
    
    let currentPauseMs = 0;
    if (tt.ostatnia_pauza_start) {
        currentPauseMs = now - new Date(tt.ostatnia_pauza_start).getTime();
    }
    
    const activeTimeMs = now - startMs - pausedMs - currentPauseMs;
    const totalSecs = Math.max(0, Math.floor(activeTimeMs / 1000));
    
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const checkIsSpecialBlocking = () => {
    return specialTasksList.some(task => {
        const tt = task.team_tasks.find((r: any) => r.team_id === team.id);
        const status = tt?.status;
        if (status === 'pominiete' || status === 'zaakceptowane' || status === 'do_oceny') return false;
        if (status === 'w_toku') return true;
        const activationTime = new Date(task.aktywowano_w).getTime();
        const isExpired = (now - activationTime) > 5 * 60 * 1000;
        const isClaimedByOther = task.team_tasks.some((r: any) => r.team_id !== team.id && ['w_toku', 'do_oceny', 'zaakceptowane'].includes(r.status));
        if (!isExpired && !isClaimedByOther && !status) return true;
        return false;
    });
  };

  const isSpecialBlocking = checkIsSpecialBlocking();

  if (loading) return <ActivityIndicator style={{marginTop: 50}} color="#ff4757" />;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionTitle}>MISJA GŁÓWNA</Text>

      {activeTask ? (
        <View style={styles.card}>
          {(() => {
            const tt = activeTask.team_tasks.find((r: any) => r.team_id === team.id);
            const status = tt?.status || 'aktywne';

            if (status === 'do_oceny') {
              return (
                <View style={styles.pendingBox}>
                  <Text style={styles.taskTitle}>{activeTask.tytul}</Text>
                  <Text style={styles.pendingText}>Sędziowie analizują materiał... 🕵️</Text>
                </View>
              );
            }

            if (!tt?.rozpoczecie_zadania || status === 'aktywne') {
              return (
                <View>
                  <Text style={styles.locationTitle}>📍 CEL: {activeTask.miejsce_opis || 'Udaj się do punktu'}</Text>
                  <View style={styles.distBox}>
                    <Text style={styles.distLabel}>DYSTANS:</Text>
                    <Text style={styles.distValue}>{distance !== null ? `${distance}m` : gpsStatus}</Text>
                  </View>
                  <TouchableOpacity style={[styles.btnStart, !isNear && styles.btnDisabled]} onPress={handleStartTask} disabled={!isNear}>
                    <Text style={styles.btnText}>{isNear ? "ROZPOCZNIJ MISJĘ" : "JESTEŚ ZA DALEKO"}</Text>
                  </TouchableOpacity>
                </View>
              );
            }

            return (
              <View>
                <Text style={styles.taskTitle}>{activeTask.tytul}</Text>
                
                {status === 'odrzucone' && (
                  <View style={styles.rejectedBox}>
                    <Text style={styles.rejectedText}>⚠️ SĘDZIA ODRZUCIŁ ZADANIE!</Text>
                    <Text style={styles.rejectedSub}>Czas nadal biegnie. Poprawcie błędy i wyślijcie poprawiony dowód LUB odrzućcie misję i przyjmijcie karę.</Text>
                  </View>
                )}

                <Text style={styles.taskDesc}>{activeTask.opis}</Text>

                <View style={styles.timerMainBox}>
                  <Text style={styles.timerMainLabel}>⏱️ CZAS WYKONYWANIA MISJI</Text>
                  <Text style={styles.timerMainValue}>{getTaskDuration(tt)}</Text>
                </View>

                {isSpecialBlocking ? (
                  <View style={[styles.uploadBtn, {backgroundColor: '#333'}]}>
                    <Text style={[styles.uploadBtnText, {color: '#ffa502'}]}>⚡ ZABLOKOWANE (TRWA AKCJA)</Text>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.uploadBtn} onPress={() => handleFileUpload(activeTask.id)} disabled={uploadingId === activeTask.id}>
                    {uploadingId === activeTask.id ? <ActivityIndicator color="#000" /> : <Text style={styles.uploadBtnText}>📸 WYŚLIJ FOTO / WIDEO</Text>}
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.abandonBtn} onPress={handleAbandonMainTask}>
                  <Text style={styles.abandonBtnText}>❌ ODRZUĆ ZADANIE (KARA: -{activeTask.kara_za_odrzucenie || 0} PKT)</Text>
                </TouchableOpacity>

              </View>
            );
          })()}
        </View>
      ) : (
        <Text style={styles.allDone}>{!team.aktywny_zestaw_id ? "Brak przypisanego zestawu misji. 🛑" : "Wszystkie misje główne ukończone! 🏆"}</Text>
      )}

      <Text style={[styles.sectionTitle, {marginTop: 30}]}>🧩 SIDEQUESTY (DOSTĘPNE ZAWSZE)</Text>
      {sideQuests.map(sq => {
        const tt = sq.team_tasks.find((r: any) => r.team_id === team.id);
        const status = tt?.status;

        return (
          <View key={sq.id} style={styles.sideCard}>
            <Text style={styles.sideTitle}>{sq.tytul}</Text>
            <Text style={styles.sideDesc}>{sq.opis}</Text>
            
            <View style={styles.sideFooter}>
              <Text style={styles.sidePoints}>PUNKTY: +{sq.punkty_bazowe}</Text>

              {status === 'do_oceny' ? (
                <Text style={styles.sidePending}>Analiza sędziego... 🕵️</Text>
              ) : status === 'zaakceptowane' ? (
                <Text style={styles.sideDone}>WYKONANE ✅</Text>
              ) : (
                isSpecialBlocking ? (
                  <View style={[styles.uploadBtnSmall, {backgroundColor: '#333'}]}>
                    <Text style={{color: '#ffa502', fontWeight: 'bold', fontSize: 10}}>⚡ ZABLOKOWANE</Text>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.uploadBtnSmall} onPress={() => handleFileUpload(sq.id)} disabled={uploadingId === sq.id}>
                    {uploadingId === sq.id ? <ActivityIndicator color="#000" /> : <Text style={styles.uploadBtnTextSmall}>📸 WYŚLIJ DOWÓD</Text>}
                  </TouchableOpacity>
                )
              )}
            </View>
          </View>
        );
      })}

      <View style={{height: 40}} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', padding: 20 },
  sectionTitle: { color: '#ff4757', fontWeight: 'bold', fontSize: 10, letterSpacing: 2, marginBottom: 15 },
  card: { backgroundColor: '#111', padding: 20, borderRadius: 25, borderWidth: 1, borderColor: '#222' },
  locationTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  distBox: { backgroundColor: '#000', padding: 15, borderRadius: 15, alignItems: 'center', marginBottom: 20 },
  distLabel: { color: '#444', fontSize: 9, fontWeight: 'bold' },
  distValue: { color: '#2ed573', fontSize: 28, fontWeight: 'bold' },
  btnStart: { backgroundColor: '#3742fa', padding: 18, borderRadius: 15, alignItems: 'center' },
  btnDisabled: { opacity: 0.3, backgroundColor: '#333' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  taskTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 10 },
  taskDesc: { color: '#aaa', lineHeight: 20, marginBottom: 20 },
  
  rejectedBox: { backgroundColor: '#330000', padding: 15, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#ff4757' },
  rejectedText: { color: '#ff4757', fontWeight: 'bold', fontSize: 14, marginBottom: 5 },
  rejectedSub: { color: '#ffaaaa', fontSize: 11, lineHeight: 16 },

  timerMainBox: { backgroundColor: '#1a1a1a', padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#333' },
  timerMainLabel: { color: '#888', fontSize: 10, fontWeight: 'bold', letterSpacing: 1 },
  timerMainValue: { color: '#fff', fontSize: 32, fontWeight: 'bold', marginTop: 5, letterSpacing: 2 },

  uploadBtn: { backgroundColor: '#2ed573', padding: 20, borderRadius: 15, alignItems: 'center' },
  uploadBtnText: { color: '#000', fontWeight: 'bold', fontSize: 15 },
  
  abandonBtn: { backgroundColor: '#1a0000', padding: 15, borderRadius: 15, alignItems: 'center', marginTop: 15, borderWidth: 1, borderColor: '#330000' },
  abandonBtnText: { color: '#ff4757', fontWeight: 'bold', fontSize: 11 },
  
  pendingBox: { alignItems: 'center', padding: 10 },
  pendingText: { color: '#ffa502', fontWeight: 'bold', textAlign: 'center', marginTop: 10 },
  allDone: { color: '#2ed573', textAlign: 'center', marginTop: 20, fontWeight: 'bold' },
  
  sideCard: { backgroundColor: '#0a0a0a', padding: 15, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#111' },
  sideTitle: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  sideDesc: { color: '#888', fontSize: 12, marginTop: 5, lineHeight: 18 },
  sideFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15, borderTopWidth: 1, borderTopColor: '#111', paddingTop: 10 },
  sidePoints: { color: '#2ed573', fontWeight: 'bold', fontSize: 11 },
  uploadBtnSmall: { backgroundColor: '#3742fa', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 8 },
  uploadBtnTextSmall: { color: '#fff', fontWeight: 'bold', fontSize: 10 },
  sidePending: { color: '#ffa502', fontWeight: 'bold', fontSize: 11 },
  sideDone: { color: '#666', fontWeight: 'bold', fontSize: 11 }
});