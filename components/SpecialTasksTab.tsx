import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/supabase';
import { Profile, Team } from '@/types';

// LIMIT CZASOWY NA ZADANIE SPECJALNE (5 minut)
const SPECIAL_TASK_DURATION_MS = 5 * 60 * 1000;

interface Props {
  userProfile: Profile;
  team: Team;
}

export default function SpecialTasksTab({ userProfile, team }: Props) {
  const [specialTasks, setSpecialTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  // Odświeżanie timera co 1 sekundę
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadTasks();
    const subTasks = supabase.channel('special_tasks_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: 'typ=eq.special_event' }, () => loadTasks())
      .subscribe();
      
    const subTeamTasks = supabase.channel('special_team_tasks_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_tasks' }, () => loadTasks())
      .subscribe();

    return () => {
      supabase.removeChannel(subTasks);
      supabase.removeChannel(subTeamTasks);
    };
  }, [team.id]);

  const loadTasks = async () => {
    setLoading(true);
    // Pobieramy tylko zadania AKTYWNE (aktywowane przez organizatora)
    const { data } = await supabase
      .from('tasks')
      .select('*, team_tasks(*)')
      .eq('typ', 'special_event')
      .eq('is_active', true)
      .order('aktywowano_w', { ascending: false });

    if (data) setSpecialTasks(data);
    setLoading(false);
  };

  const handleClaim = async (task: any) => {
    const currentNow = new Date().toISOString();
    await supabase.from('team_tasks').update({ ostatnia_pauza_start: currentNow })
      .eq('team_id', team.id).eq('status', 'w_toku');

    await supabase.from('team_tasks').upsert([{
      team_id: team.id, task_id: task.id, status: 'w_toku', rozpoczecie_zadania: currentNow
    }], { onConflict: 'team_id,task_id' });
    
    loadTasks();
  };

  const handleIgnore = async (task: any) => {
    await supabase.from('team_tasks').upsert([{
      team_id: team.id, task_id: task.id, status: 'pominiete'
    }], { onConflict: 'team_id,task_id' });
    loadTasks();
  };

  const handleAbandon = async (task: any) => {
    Alert.alert("Porzuć wydarzenie", "Czy na pewno? Zadanie wróci do puli i inni będą mogli je przejąć!", [
      { text: "Anuluj", style: "cancel" },
      { text: "PORZUĆ", style: "destructive", onPress: async () => {
          const nowMs = new Date().getTime();

          // 1. Zdejmij pauzę z głównego zadania
          const { data: mainTasks } = await supabase.from('team_tasks').select('*').eq('team_id', team.id).eq('status', 'w_toku').not('ostatnia_pauza_start', 'is', null);
          if (mainTasks && mainTasks.length > 0) {
            const mTask = mainTasks[0];
            const pStart = new Date(mTask.ostatnia_pauza_start).getTime();
            await supabase.from('team_tasks').update({ suma_pauzy_ms: (mTask.suma_pauzy_ms || 0) + (nowMs - pStart), ostatnia_pauza_start: null }).eq('id', mTask.id);
          }

          // 2. Oznacz dla tej drużyny jako pominięte
          await supabase.from('team_tasks').upsert([{ team_id: team.id, task_id: task.id, status: 'pominiete' }], { onConflict: 'team_id,task_id' });

          // 3. RESET TIMERA: aktualizujemy "aktywowano_w" na teraz, aby inni znowu mieli pełne 5 minut!
          await supabase.from('tasks').update({ aktywowano_w: new Date().toISOString() }).eq('id', task.id);

          // 4. Powiadomienia push
          const { data: profiles } = await supabase.from('profiles').select('expo_push_token').not('expo_push_token', 'is', null).neq('team_id', team.id);
          if (profiles && profiles.length > 0) {
            const messages = profiles.map(p => ({
              to: p.expo_push_token, sound: 'default', title: '⚡ ZADANIE WRÓCIŁO DO PULI!', body: `Drużyna odrzuciła "${task.tytul}". Macie nowe 5 minut na przejęcie!`,
            }));
            await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(messages) });
          }
          loadTasks();
      }}
    ]);
  };

  const handleFileUpload = async (taskId: string) => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.4 });
    if (result.canceled) return;
    setUploadingId(taskId);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop();
      const fn = `${team.id}/${taskId}_${Date.now()}.${ext}`;
      const fd = new FormData();
      fd.append('file', { uri: Platform.OS === 'ios' ? asset.uri.replace('file://', '') : asset.uri, name: fn, type: asset.type === 'video' ? 'video/mp4' : 'image/jpeg' } as any);
      await supabase.storage.from('evidence').upload(fn, fd);
      const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(fn);
      await supabase.from('team_tasks').upsert({ team_id: team.id, task_id: taskId, status: 'do_oceny', dowod_url: urlData.publicUrl, przeslano_zadanie: new Date().toISOString() }, { onConflict: 'team_id,task_id' });
      Alert.alert('Sukces', 'Dowód wysłany! Sędzia wkrótce go oceni.');
      loadTasks();
    } catch (e: any) { Alert.alert('Błąd', e.message); } finally { setUploadingId(null); }
  };

  if (loading) return <ActivityIndicator color="#ffa502" style={{marginTop: 50}} />;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.headerTitle}>WYDARZENIA SPECJALNE ⚡</Text>
      <Text style={styles.headerSub}>Limitowane czasowo. Kto pierwszy, ten lepszy!</Text>

      {specialTasks.length === 0 ? (
        <Text style={styles.empty}>Brak aktywnych wydarzeń. Oczekuj na komunikaty.</Text>
      ) : (
        specialTasks.map(task => {
          const tt = task.team_tasks.find((r: any) => r.team_id === team.id);
          const status = tt?.status;

          // Obliczanie czasu timera
          const activationTime = new Date(task.aktywowano_w).getTime();
          const timeLeftMs = (activationTime + SPECIAL_TASK_DURATION_MS) - now;
          const isExpired = timeLeftMs <= 0;
          
          if (status === 'pominiete' || status === 'zaakceptowane') return null;

          const isClaimedByOther = task.team_tasks.some((r: any) => r.team_id !== team.id && ['w_toku', 'do_oceny', 'zaakceptowane'].includes(r.status));
          if (isClaimedByOther && status !== 'w_toku' && status !== 'do_oceny') return null;

          // Jeśli czas minął, zadania nikt nie przejął (nie jest 'w_toku') – znika.
          if (isExpired && !status) return null;

          // Formatowanie czasu (np. 04:59)
          const mins = Math.max(0, Math.floor(timeLeftMs / 60000));
          const secs = Math.max(0, Math.floor((timeLeftMs % 60000) / 1000));
          const timerStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

          return (
            <View key={task.id} style={[styles.card, status === 'w_toku' && styles.cardActive]}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                <Text style={styles.taskTitle}>{task.tytul}</Text>
                {/* WIDŻET TIMERA */}
                {!status && (
                    <View style={styles.timerBox}>
                        <Text style={styles.timerLabel}>POZOSTAŁO</Text>
                        <Text style={[styles.timerValue, timeLeftMs < 60000 && {color: '#ff4757'}]}>{timerStr}</Text>
                    </View>
                )}
              </View>
              
              {!status && (
                <View>
                  <View style={styles.riskBox}>
                    <Text style={styles.riskGain}>🎯 DO ZDOBYCIA: +{task.punkty_bazowe} PKT</Text>
                    <Text style={styles.riskLoss}>⚠️ KARA ZA ODRZUCENIE: -{task.kara_za_odrzucenie || 0} PKT</Text>
                  </View>

                  <TouchableOpacity style={styles.acceptBtn} onPress={() => handleClaim(task)}>
                    <Text style={styles.acceptBtnText}>PRZYJMIJ ZADANIE</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.ignoreBtn} onPress={() => handleIgnore(task)}>
                    <Text style={styles.ignoreBtnText}>Zignoruj (Zniknie dla Ciebie)</Text>
                  </TouchableOpacity>
                </View>
              )}

              {status === 'w_toku' && (
                <View>
                  <Text style={styles.taskDesc}>{task.opis}</Text>
                  <TouchableOpacity style={styles.uploadBtn} onPress={() => handleFileUpload(task.id)} disabled={uploadingId === task.id}>
                    {uploadingId === task.id ? <ActivityIndicator color="#000" /> : <Text style={styles.uploadBtnText}>📸 WYŚLIJ DOWÓD ZAKOŃCZENIA</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.abandonBtn} onPress={() => handleAbandon(task)}>
                    <Text style={styles.abandonBtnText}>❌ PORZUĆ (KARA: -{task.kara_za_odrzucenie || 0} PKT)</Text>
                  </TouchableOpacity>
                </View>
              )}

              {status === 'do_oceny' && (
                <View style={styles.pendingBox}>
                  <Text style={styles.pendingText}>Sędzia analizuje zgłoszenie... 🕵️</Text>
                </View>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', padding: 20 },
  headerTitle: { color: '#ffa502', fontWeight: 'bold', fontSize: 18, letterSpacing: 1 },
  headerSub: { color: '#888', fontSize: 11, marginBottom: 20 },
  empty: { color: '#555', textAlign: 'center', marginTop: 40, fontStyle: 'italic' },
  card: { backgroundColor: '#111', padding: 20, borderRadius: 20, borderWidth: 1, borderColor: '#333', marginBottom: 15 },
  cardActive: { borderColor: '#ffa502', borderWidth: 2 },
  taskTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', flex: 1, marginRight: 10 },
  taskDesc: { color: '#ccc', lineHeight: 22, marginBottom: 20, marginTop: 10 },
  
  // Ryzyko
  riskBox: { backgroundColor: '#1a1a1a', padding: 12, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#222' },
  riskGain: { color: '#2ed573', fontWeight: 'bold', fontSize: 11, marginBottom: 5 },
  riskLoss: { color: '#ff4757', fontWeight: 'bold', fontSize: 11 },
  
  // Timer
  timerBox: { backgroundColor: '#222', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, alignItems: 'center' },
  timerLabel: { color: '#888', fontSize: 8, fontWeight: 'bold', letterSpacing: 1 },
  timerValue: { color: '#ffa502', fontSize: 16, fontWeight: 'bold' },

  acceptBtn: { backgroundColor: '#ffa502', padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 10 },
  acceptBtnText: { color: '#000', fontWeight: 'bold' },
  ignoreBtn: { padding: 10, alignItems: 'center' },
  ignoreBtnText: { color: '#666', fontWeight: 'bold', fontSize: 11 },
  uploadBtn: { backgroundColor: '#2ed573', padding: 18, borderRadius: 12, alignItems: 'center', marginBottom: 10 },
  uploadBtnText: { color: '#000', fontWeight: 'bold' },
  abandonBtn: { backgroundColor: '#333', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  abandonBtnText: { color: '#ff4757', fontWeight: 'bold', fontSize: 12 },
  pendingBox: { backgroundColor: '#1a1a1a', padding: 15, borderRadius: 10 },
  pendingText: { color: '#ffa502', textAlign: 'center', fontWeight: 'bold' }
});