import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/supabase';
import { Profile, Team } from '@/types';

interface Props {
  userProfile: Profile;
  team: Team;
}

export default function SpecialTasksTab({ userProfile, team }: Props) {
  const [specialTasks, setSpecialTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

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
    const { data } = await supabase
      .from('tasks')
      .select('*, team_tasks(*)')
      .eq('typ', 'special_event')
      .order('utworzono_w', { ascending: false });

    if (data) setSpecialTasks(data);
    setLoading(false);
  };

  const handleClaim = async (task: any) => {
    const now = new Date().toISOString();

    // Zatrzymanie aktywnego głównego zadania
    await supabase.from('team_tasks').update({ ostatnia_pauza_start: now })
      .eq('team_id', team.id).eq('status', 'w_toku');

    await supabase.from('team_tasks').upsert([{
      team_id: team.id,
      task_id: task.id,
      status: 'w_toku',
      rozpoczecie_zadania: now
    }], { onConflict: 'team_id,task_id' });
    
    loadTasks();
  };

  const handleIgnore = async (task: any) => {
    await supabase.from('team_tasks').upsert([{
      team_id: team.id,
      task_id: task.id,
      status: 'pominiete'
    }], { onConflict: 'team_id,task_id' });
    loadTasks();
  };

  // LOGIKA PORZUCANIA ZADANIA (Odrzucenie w trakcie wykonywania)
  const handleAbandon = async (task: any) => {
    Alert.alert(
      "Porzuć wydarzenie",
      "Czy na pewno chcesz zrezygnować? Zadanie wróci do puli i inne drużyny będą mogły je przejąć!",
      [
        { text: "Anuluj", style: "cancel" },
        { 
          text: "PORZUĆ", 
          style: "destructive", 
          onPress: async () => {
            const nowMs = new Date().getTime();

            // 1. ROZLICZ I ZAKOŃCZ PAUZĘ GŁÓWNEGO ZADANIA
            const { data: mainTasks } = await supabase
              .from('team_tasks')
              .select('*')
              .eq('team_id', team.id)
              .eq('status', 'w_toku')
              .not('ostatnia_pauza_start', 'is', null);

            if (mainTasks && mainTasks.length > 0) {
              const mainTask = mainTasks[0];
              const pauseStartMs = new Date(mainTask.ostatnia_pauza_start).getTime();
              const pauseDuration = nowMs - pauseStartMs;
              await supabase.from('team_tasks').update({
                suma_pauzy_ms: (mainTask.suma_pauzy_ms || 0) + pauseDuration,
                ostatnia_pauza_start: null
              }).eq('id', mainTask.id);
            }

            // 2. USTAW ZADANIE SPECJALNE JAKO POMINIĘTE DLA TEJ DRUŻYNY
            await supabase.from('team_tasks').upsert([{
              team_id: team.id,
              task_id: task.id,
              status: 'pominiete'
            }], { onConflict: 'team_id,task_id' });

            // 3. WYŚLIJ POWIADOMIENIE DO RESZTY DRUŻYN
            const { data: profiles } = await supabase
              .from('profiles')
              .select('expo_push_token')
              .not('expo_push_token', 'is', null)
              .neq('team_id', team.id); // Wszyscy oprócz drużyny porzucającej

            if (profiles && profiles.length > 0) {
              const messages = profiles.map(p => ({
                to: p.expo_push_token,
                sound: 'default',
                title: '⚡ ZADANIE WRÓCIŁO DO PULI!',
                body: `Jedna z drużyn zrezygnowała z "${task.tytul}". Kto pierwszy ten lepszy!`,
              }));

              await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify(messages),
              });
            }

            loadTasks();
          }
        }
      ]
    );
  };

  const handleFileUpload = async (taskId: string) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.4,
    });
    if (result.canceled) return;
    
    setUploadingId(taskId);
    try {
      const asset = result.assets[0];
      const fileExt = asset.uri.split('.').pop();
      const fileName = `${team.id}/${taskId}_${Date.now()}.${fileExt}`;
      const formData = new FormData();
      formData.append('file', {
        uri: Platform.OS === 'ios' ? asset.uri.replace('file://', '') : asset.uri,
        name: fileName,
        type: asset.type === 'video' ? 'video/mp4' : 'image/jpeg',
      } as any);

      await supabase.storage.from('evidence').upload(fileName, formData);
      const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(fileName);

      await supabase.from('team_tasks').upsert({ 
        team_id: team.id, task_id: taskId, status: 'do_oceny', 
        dowod_url: urlData.publicUrl, przeslano_zadanie: new Date().toISOString() 
      }, { onConflict: 'team_id,task_id' });

      Alert.alert('Sukces', 'Dowód wysłany! Sędzia wkrótce go oceni.');
      loadTasks();
    } catch (e: any) {
      Alert.alert('Błąd', e.message);
    } finally {
      setUploadingId(null);
    }
  };

  if (loading) return <ActivityIndicator color="#ffa502" style={{marginTop: 50}} />;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.headerTitle}>WYDARZENIA SPECJALNE ⚡</Text>
      <Text style={styles.headerSub}>Tylko jedna drużyna może przejąć zadanie!</Text>

      {specialTasks.length === 0 ? (
        <Text style={styles.empty}>Brak aktywnych wydarzeń. Oczekuj na komunikaty.</Text>
      ) : (
        specialTasks.map(task => {
          const tt = task.team_tasks.find((r: any) => r.team_id === team.id);
          const status = tt?.status;

          if (status === 'pominiete' || status === 'zaakceptowane') return null;

          // SPRAWDZENIE GLOBALNEJ PULI: Czy INNA drużyna przejęła zadanie?
          const isClaimedByOther = task.team_tasks.some((r: any) => 
            r.team_id !== team.id && ['w_toku', 'do_oceny', 'zaakceptowane'].includes(r.status)
          );

          // Jeśli inna drużyna je ma, a my nie - chowamy je
          if (isClaimedByOther && status !== 'w_toku' && status !== 'do_oceny') {
            return null;
          }

          return (
            <View key={task.id} style={[styles.card, status === 'w_toku' && styles.cardActive]}>
              <Text style={styles.taskTitle}>{task.tytul}</Text>
              
              {!status && (
                <View>
                  <Text style={styles.warning}>Przyjęcie zapauzuje Twoją misję główną!</Text>
                  <TouchableOpacity style={styles.acceptBtn} onPress={() => handleClaim(task)}>
                    <Text style={styles.acceptBtnText}>PRZYJMIJ ZADANIE</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.ignoreBtn} onPress={() => handleIgnore(task)}>
                    <Text style={styles.ignoreBtnText}>Zignoruj</Text>
                  </TouchableOpacity>
                </View>
              )}

              {status === 'w_toku' && (
                <View>
                  <Text style={styles.taskDesc}>{task.opis}</Text>
                  
                  <TouchableOpacity style={styles.uploadBtn} onPress={() => handleFileUpload(task.id)} disabled={uploadingId === task.id}>
                    {uploadingId === task.id ? <ActivityIndicator color="#000" /> : <Text style={styles.uploadBtnText}>📸 WYŚLIJ DOWÓD ZAKOŃCZENIA</Text>}
                  </TouchableOpacity>

                  {/* NOWY PRZYCISK PORZUCENIA */}
                  <TouchableOpacity style={styles.abandonBtn} onPress={() => handleAbandon(task)}>
                    <Text style={styles.abandonBtnText}>❌ PORZUĆ (ODDAJ DO PULI)</Text>
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
  taskTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  taskDesc: { color: '#ccc', lineHeight: 22, marginBottom: 20 },
  warning: { color: '#ff4757', fontSize: 11, fontWeight: 'bold', marginBottom: 15 },
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