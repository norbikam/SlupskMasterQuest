import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Image, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/supabase';
import { Task, Team, Profile } from '@/types';

interface Props {
  userProfile: Profile;
  team: Team;
}

export default function TasksPlayerView({ userProfile, team }: Props) {
  const [activeTask, setActiveTask] = useState<any>(null);
  const [sideQuests, setSideQuests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNear, setIsNear] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [gpsStatus, setGpsStatus] = useState('Szukam sygnału...');

  useEffect(() => {
    loadTasks();

    // Subskrypcja Realtime dla statusów zadań
    const channel = supabase.channel('task_sync')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'team_tasks', 
        filter: `team_id=eq.${team.id}` 
      }, () => loadTasks())
      .subscribe();

    const locSub = startGPS();

    return () => {
      supabase.removeChannel(channel);
      locSub.then(sub => sub?.remove());
    };
  }, [team.id, activeTask?.id, team.aktywny_zestaw_id]);

  const loadTasks = async () => {
    setLoading(true);
    
    // ZABEZPIECZENIE PRZED CRASHEM (BŁĄD UNDEFINED)
    if (!team.aktywny_zestaw_id) {
      setSideQuests([]);
      setActiveTask(null);
      setLoading(false);
      return;
    }

    const { data: allTasks, error } = await supabase
      .from('tasks')
      .select('*, team_tasks(*)')
      .eq('zestaw_id', team.aktywny_zestaw_id);

    if (error) {
      console.error("Błąd pobierania zadań:", error);
      setLoading(false);
      return;
    }

    if (allTasks) {
      // Sidequesty są zawsze widoczne
      setSideQuests(allTasks.filter(t => t.typ === 'sidequest'));

      // Znajdź następne zadanie główne, SORTOWANE PO KOLEJNOŚCI
      const mains = allTasks
        .filter(t => t.typ === 'glowne')
        .sort((a, b) => (a.kolejnosc || 0) - (b.kolejnosc || 0));

      const next = mains.find(t => {
        const rel = t.team_tasks.find((r: any) => r.team_id === team.id);
        return rel?.status !== 'zaakceptowane';
      });

      setActiveTask(next);
    }
    setLoading(false);
  };

  const startGPS = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setGpsStatus('Brak uprawnień GPS');
      return;
    }

    return await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 5 },
      (loc) => {
        setGpsStatus('GPS Aktywny');
        if (activeTask && activeTask.latitude && activeTask.longitude) {
          const d = calculateDistance(
            loc.coords.latitude, 
            loc.coords.longitude, 
            activeTask.latitude, 
            activeTask.longitude
          );
          setDistance(Math.round(d));
          setIsNear(d <= (activeTask.promien_metry || 50));
        }
      }
    );
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const handleStartTask = async () => {
    if (!isNear) return Alert.alert("Za daleko!", "Musisz być na miejscu, aby rozpocząć.");
    
    // Użycie UPSERT (wymaga unikalnego klucza team_task_unique_pair z SQL)
    await supabase.from('team_tasks').upsert({
      team_id: team.id,
      task_id: activeTask.id,
      status: 'w_toku',
      rozpoczecie_zadania: new Date().toISOString()
    }, { onConflict: 'team_id,task_id' });
    
    loadTasks();
  };

  const handleFileUpload = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: false,
      quality: 0.4,
    });

    if (result.canceled) return;
    setUploading(true);

    const asset = result.assets[0];
    try {
      const fileExt = asset.uri.split('.').pop();
      const fileName = `${team.id}/${activeTask.id}_${Date.now()}.${fileExt}`;
      
      const formData = new FormData();
      formData.append('file', {
        uri: Platform.OS === 'ios' ? asset.uri.replace('file://', '') : asset.uri,
        name: fileName,
        type: asset.type === 'video' ? 'video/mp4' : 'image/jpeg',
      } as any);

      const { error: storageError } = await supabase.storage
        .from('evidence')
        .upload(fileName, formData);

      if (storageError) throw storageError;

      const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(fileName);

      // STATUS MUSI BYĆ 'do_oceny', ŻEBY SĘDZIA TO WIDZIAŁ
      await supabase.from('team_tasks')
        .upsert({ 
          team_id: team.id,
          task_id: activeTask.id,
          status: 'do_oceny', 
          dowod_url: urlData.publicUrl, 
          przeslano_zadanie: new Date().toISOString() 
        }, { onConflict: 'team_id,task_id' });

      Alert.alert('Sukces', 'Dowód wysłany! Czekaj na werdykt sędziego.');
      loadTasks();
    } catch (error: any) {
      Alert.alert('Błąd uploadu', error.message);
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <ActivityIndicator style={{marginTop: 50}} color="#ff4757" />;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionTitle}>MISJA GŁÓWNA</Text>

      {activeTask ? (
        <View style={styles.card}>
          {/* LOGIKA STANÓW ZADANIA */}
          {(() => {
            const tt = activeTask.team_tasks.find((r: any) => r.team_id === team.id);
            const status = tt?.status || 'aktywne';

            // 1. FAZA: OCZEKIWANIE NA WERYFIKACJĘ (do_oceny)
            if (status === 'do_oceny') {
              return (
                <View style={styles.pendingBox}>
                  <Text style={styles.taskTitle}>{activeTask.tytul}</Text>
                  <Text style={styles.pendingText}>Dowód przesłany. Sędziowie analizują materiał... 🕵️</Text>
                </View>
              );
            }

            // 2. FAZA: DOJAZD (Zadanie nie wystartowane / odrzucone z powrotem do "w_toku")
            if (!tt?.rozpoczecie_zadania || status === 'aktywne') {
              return (
                <View>
                  <Text style={styles.locationTitle}>📍 CEL: {activeTask.miejsce_opis || 'Udaj się do punktu'}</Text>
                  <View style={styles.distBox}>
                    <Text style={styles.distLabel}>DYSTANS:</Text>
                    <Text style={styles.distValue}>{distance !== null ? `${distance}m` : gpsStatus}</Text>
                  </View>
                  <TouchableOpacity 
                    style={[styles.btnStart, !isNear && styles.btnDisabled]} 
                    onPress={handleStartTask} 
                    disabled={!isNear}
                  >
                    <Text style={styles.btnText}>{isNear ? "ROZPOCZNIJ MISJĘ" : "JESTEŚ ZA DALEKO"}</Text>
                  </TouchableOpacity>
                </View>
              );
            }

            // 3. FAZA: WYKONYWANIE (w_toku, po kliknięciu Start)
            return (
              <View>
                <Text style={styles.taskTitle}>{activeTask.tytul}</Text>
                <Text style={styles.taskDesc}>{activeTask.opis}</Text>
                
                <TouchableOpacity 
                  style={styles.uploadBtn} 
                  onPress={handleFileUpload}
                  disabled={uploading}
                >
                  {uploading ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <Text style={styles.uploadBtnText}>📸 WYŚLIJ FOTO / WIDEO</Text>
                  )}
                </TouchableOpacity>
                <Text style={styles.timerHint}>⏱️ Czas netto jest mierzony!</Text>
              </View>
            );
          })()}
        </View>
      ) : (
        <Text style={styles.allDone}>
          {!team.aktywny_zestaw_id 
            ? "Brak przypisanego zestawu misji. Oczekuj na polecenia dowództwa. 🛑" 
            : "Wszystkie misje główne ukończone! 🏆"}
        </Text>
      )}

      {/* SIDEQUESTY */}
      <Text style={[styles.sectionTitle, {marginTop: 30}]}>SIDEQUESTY (DOSTĘPNE ZAWSZE)</Text>
      {sideQuests.map(sq => (
        <View key={sq.id} style={styles.sideCard}>
          <Text style={styles.sideTitle}>{sq.tytul}</Text>
          <Text style={styles.sideDesc}>{sq.opis}</Text>
        </View>
      ))}
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
  uploadBtn: { backgroundColor: '#2ed573', padding: 20, borderRadius: 15, alignItems: 'center' },
  uploadBtnText: { color: '#000', fontWeight: 'bold', fontSize: 15 },
  timerHint: { color: '#ffa502', fontSize: 10, textAlign: 'center', marginTop: 15, fontWeight: 'bold' },
  pendingBox: { alignItems: 'center', padding: 10 },
  pendingText: { color: '#ffa502', fontWeight: 'bold', textAlign: 'center', marginTop: 10 },
  allDone: { color: '#2ed573', textAlign: 'center', marginTop: 20, fontWeight: 'bold' },
  sideCard: { backgroundColor: '#0a0a0a', padding: 15, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#111' },
  sideTitle: { color: '#fff', fontWeight: 'bold' },
  sideDesc: { color: '#555', fontSize: 12, marginTop: 5 }
});