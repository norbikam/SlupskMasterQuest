import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Image } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/supabase';
import { Profile, Team } from '@/types';

interface Props {
  userProfile: Profile;
  team: Team;
}

export default function TasksPlayerView({ userProfile, team }: Props) {
  const [activeTask, setActiveTask] = useState<any>(null);
  const [sideQuests, setSideQuests] = useState<any[]>([]);
  const [distance, setDistance] = useState<number | null>(null);
  const [isNear, setIsNear] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadTasks();
    const locSub = startGPS();
    const channel = supabase.channel('tasks_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_tasks', filter: `team_id=eq.${team.id}` }, () => loadTasks())
      .subscribe();

    return () => { 
      locSub.then(s => s?.remove());
      supabase.removeChannel(channel);
    };
  }, [team.aktywny_zestaw_id, activeTask?.id]);

  const loadTasks = async () => {
    setLoading(true);
    const { data } = await supabase.from('tasks').select('*, team_tasks(*)').eq('zestaw_id', team.aktywny_zestaw_id);
    if (data) {
      setSideQuests(data.filter(t => t.typ === 'sidequest'));
      // SORTOWANIE
      const mains = data.filter(t => t.typ === 'glowne').sort((a, b) => a.kolejnosc - b.kolejnosc);
      const next = mains.find(t => {
        const rel = t.team_tasks.find((r: any) => r.team_id === team.id);
        return rel?.status !== 'zaakceptowane';
      });
      setActiveTask(next);
    }
    setLoading(false);
  };

  const startGPS = async () => {
    await Location.requestForegroundPermissionsAsync();
    return await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 5 }, (loc) => {
      if (activeTask?.latitude) {
        const d = calculateDistance(loc.coords.latitude, loc.coords.longitude, activeTask.latitude, activeTask.longitude);
        setDistance(Math.round(d));
        setIsNear(d <= 50);
      }
    });
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const handleStart = async () => {
    if (!isNear) return Alert.alert("Za daleko!", "Musisz być na miejscu.");
    await supabase.from('team_tasks').upsert({
      team_id: team.id, task_id: activeTask.id, status: 'w_toku', rozpoczecie_zadania: new Date().toISOString()
    }, { onConflict: 'team_id,task_id' });
    loadTasks();
  };

  const handleUpload = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.4 });
    if (res.canceled) return;
    setUploading(true);
    try {
      const asset = res.assets[0];
      const fileName = `${team.id}/${activeTask.id}_${Date.now()}.jpg`;
      const formData = new FormData();
      formData.append('file', { uri: asset.uri, name: fileName, type: 'image/jpeg' } as any);
      
      const { error: storageError } = await supabase.storage.from('evidence').upload(fileName, formData);
      if (storageError) throw storageError;

      const { data: url } = supabase.storage.from('evidence').getPublicUrl(fileName);

      // STATUS: do_oceny (kluczowe dla sędziego)
      await supabase.from('team_tasks').update({
        status: 'do_oceny',
        dowod_url: url.publicUrl,
        przeslano_zadanie: new Date().toISOString()
      }).eq('team_id', team.id).eq('task_id', activeTask.id);

      Alert.alert("Sukces", "Zadanie wysłane do oceny!");
      loadTasks();
    } catch (e: any) { Alert.alert("Błąd", e.message); }
    setUploading(false);
  };

  if (loading) return <ActivityIndicator color="#ff4757" style={{marginTop: 50}} />;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionTitle}>AKTYWNA MISJA GŁÓWNA</Text>
      {activeTask ? (
        <View style={styles.card}>
          {(() => {
            const tt = activeTask.team_tasks.find((r: any) => r.team_id === team.id);
            if (tt?.status === 'do_oceny') return <Text style={styles.statusInfo}>Sędzia sprawdza dowód... 🕵️</Text>;
            if (!tt?.rozpoczecie_zadania) return (
              <>
                <Text style={styles.locName}>📍 CEL: {activeTask.miejsce_opis}</Text>
                <Text style={styles.dist}>{distance ? `${distance}m` : 'Szukam GPS...'}</Text>
                <TouchableOpacity style={[styles.btn, !isNear && styles.disabled]} onPress={handleStart} disabled={!isNear}>
                  <Text style={styles.btnText}>{isNear ? 'ROZPOCZNIJ MISJĘ' : 'PODEJDŹ BLIŻEJ'}</Text>
                </TouchableOpacity>
              </>
            );
            return (
              <>
                <Text style={styles.taskTitle}>{activeTask.tytul}</Text>
                <Text style={styles.taskDesc}>{activeTask.opis}</Text>
                <TouchableOpacity style={styles.uploadBtn} onPress={handleUpload} disabled={uploading}>
                  {uploading ? <ActivityIndicator color="#000" /> : <Text style={styles.uploadBtnText}>📸 PRZEŚLIJ DOWÓD</Text>}
                </TouchableOpacity>
              </>
            );
          })()}
        </View>
      ) : <Text style={styles.empty}>Wszystkie zadania ukończone! 🏆</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', padding: 20 },
  sectionTitle: { color: '#ff4757', fontWeight: 'bold', fontSize: 10, letterSpacing: 2, marginBottom: 15 },
  card: { backgroundColor: '#111', padding: 25, borderRadius: 25, borderWidth: 1, borderColor: '#222' },
  locName: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  dist: { color: '#2ed573', fontSize: 36, fontWeight: 'bold', marginVertical: 15 },
  btn: { backgroundColor: '#3742fa', padding: 18, borderRadius: 15, alignItems: 'center' },
  disabled: { opacity: 0.3 },
  btnText: { color: '#fff', fontWeight: 'bold' },
  taskTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 10 },
  taskDesc: { color: '#aaa', lineHeight: 20, marginBottom: 20 },
  uploadBtn: { backgroundColor: '#2ed573', padding: 18, borderRadius: 15, alignItems: 'center' },
  uploadBtnText: { color: '#000', fontWeight: 'bold' },
  statusInfo: { color: '#ffa502', fontWeight: 'bold', textAlign: 'center' },
  empty: { color: '#444', textAlign: 'center', marginTop: 40 }
});