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
  const [loading, setLoading] = useState(true);
  const [isNear, setIsNear] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  
  // Zmieniamy stan uploading z true/false na przechwytywanie ID zadania
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState('Szukam sygnału...');

  useEffect(() => {
    loadTasks();
    
    // Zmiany w przydzielonych drużynie zadaniach (team_tasks)
    const channelTT = supabase.channel('task_sync_tt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_tasks', filter: `team_id=eq.${team.id}` }, () => loadTasks())
      .subscribe();
      
    // Zmiany globalne w zadaniach (np. organizator aktywuje zadanie poboczne)
    const channelTasks = supabase.channel('tasks_active_sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks' }, () => loadTasks())
      .subscribe();

    const locSub = startGPS();

    return () => {
      supabase.removeChannel(channelTT);
      supabase.removeChannel(channelTasks);
      locSub.then(sub => sub?.remove());
    };
  }, [team.id, activeTask?.id, team.aktywny_zestaw_id]);

  const loadTasks = async () => {
    setLoading(true);

    // 1. ZADANIA GŁÓWNE
    let mains: any[] = [];
    if (team.aktywny_zestaw_id) {
      const { data } = await supabase.from('tasks')
        .select('*, team_tasks(*)')
        .eq('zestaw_id', team.aktywny_zestaw_id)
        .eq('typ', 'glowne')
        .eq('is_active', true);
        
      if (data) mains = data.sort((a, b) => (a.kolejnosc || 0) - (b.kolejnosc || 0));
    }

    // Szukamy pierwszego zadania głównego z zestawu, które nie jest zaakceptowane
    const next = mains.find(t => {
      const rel = t.team_tasks.find((r: any) => r.team_id === team.id);
      return rel?.status !== 'zaakceptowane';
    });
    setActiveTask(next || null);

    // 2. SIDEQUESTY (Pobierane wszystkie aktywne, bez względu na zestaw)
    const { data: sides } = await supabase.from('tasks')
      .select('*, team_tasks(*)')
      .eq('typ', 'sidequest')
      .eq('is_active', true);
      
    if (sides) setSideQuests(sides);

    setLoading(false);
  };

  const startGPS = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { setGpsStatus('Brak uprawnień GPS'); return; }

    return await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 5 }, (loc) => {
        setGpsStatus('GPS Aktywny');
        if (activeTask?.latitude && activeTask?.longitude) {
          const d = calculateDistance(loc.coords.latitude, loc.coords.longitude, activeTask.latitude, activeTask.longitude);
          setDistance(Math.round(d));
          setIsNear(d <= (activeTask.promien_metry || 50));
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

  const handleStartTask = async () => {
    if (!isNear) return Alert.alert("Za daleko!", "Musisz być na miejscu, aby rozpocząć.");
    await supabase.from('team_tasks').upsert({
      team_id: team.id, task_id: activeTask.id, status: 'w_toku', rozpoczecie_zadania: new Date().toISOString()
    }, { onConflict: 'team_id,task_id' });
    loadTasks();
  };

  const handleCancelTask = () => {
    Alert.alert("Przerwij misję", "Zresetujesz czas i postęp. Misja wróci do stanu oczekiwania na dojście. Kontynuować?", [
        { text: "Nie", style: "cancel" },
        { text: "TAK, PRZERWIJ", style: "destructive", onPress: async () => {
            await supabase.from('team_tasks').delete().eq('team_id', team.id).eq('task_id', activeTask.id);
            loadTasks();
          }
        }
      ]);
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
                <Text style={styles.taskDesc}>{activeTask.opis}</Text>
                
                <TouchableOpacity style={styles.uploadBtn} onPress={() => handleFileUpload(activeTask.id)} disabled={uploadingId === activeTask.id}>
                  {uploadingId === activeTask.id ? <ActivityIndicator color="#000" /> : <Text style={styles.uploadBtnText}>📸 WYŚLIJ FOTO / WIDEO</Text>}
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelBtn} onPress={handleCancelTask}>
                  <Text style={styles.cancelBtnText}>❌ PRZERWIJ (ZRESETUJ ZADANIE)</Text>
                </TouchableOpacity>

                <Text style={styles.timerHint}>⏱️ Czas netto jest mierzony!</Text>
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
                <TouchableOpacity style={styles.uploadBtnSmall} onPress={() => handleFileUpload(sq.id)} disabled={uploadingId === sq.id}>
                  {uploadingId === sq.id ? <ActivityIndicator color="#000" /> : <Text style={styles.uploadBtnTextSmall}>📸 WYŚLIJ DOWÓD</Text>}
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}

      {/* Margines na samym dole */}
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
  uploadBtn: { backgroundColor: '#2ed573', padding: 20, borderRadius: 15, alignItems: 'center' },
  uploadBtnText: { color: '#000', fontWeight: 'bold', fontSize: 15 },
  cancelBtn: { backgroundColor: '#1a0000', padding: 15, borderRadius: 15, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: '#330000' },
  cancelBtnText: { color: '#ff4757', fontWeight: 'bold', fontSize: 12 },
  timerHint: { color: '#ffa502', fontSize: 10, textAlign: 'center', marginTop: 15, fontWeight: 'bold' },
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