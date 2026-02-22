import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert, TextInput, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import { supabase } from '@/supabase';
import { Task, Team, TeamTask } from '@/types';

export default function TasksPlayerView({ team, userProfile }: { team: Team, userProfile: any }) {
  const [mainTask, setMainTask] = useState<any>(null); // Następne zadanie główne
  const [sideQuests, setSideQuests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNear, setIsNear] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  
  // Stan dla odpowiedzi
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadTasks();
    const locSub = startGPS();
    
    // Realtime: odśwież, gdy sędzia zaakceptuje zadanie (żeby pokazać następne)
    const channel = supabase.channel('task_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_tasks', filter: `team_id=eq.${team.id}` }, () => loadTasks())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadTasks = async () => {
    setLoading(true);
    // 1. Pobierz wszystkie zadania z przypisanego zestawu
    const { data: allTasks } = await supabase
      .from('tasks')
      .select('*, team_tasks(*)')
      .eq('zestaw_id', team.aktywny_zestaw_id);

    if (allTasks) {
      // 2. Filtruj Sidequesty (zawsze widoczne)
      setSideQuests(allTasks.filter(t => t.typ === 'sidequest'));

      // 3. Logika sekwencyjna dla głównych
      // Szukamy pierwszego zadania głównego, które nie jest jeszcze 'zaakceptowane'
      const mains = allTasks
        .filter(t => t.typ === 'glowne')
        .sort((a, b) => a.id.localeCompare(b.id)); // Prosta kolejność po ID

      const nextMain = mains.find(t => {
        const rel = t.team_tasks.find((r: any) => r.team_id === team.id);
        return rel?.status !== 'zaakceptowane';
      });

      setMainTask(nextMain);
    }
    setLoading(false);
  };

  const startGPS = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;

    return await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 5 },
      (loc) => {
        if (mainTask?.lat && mainTask?.lng) {
          const d = calculateDistance(loc.coords.latitude, loc.coords.longitude, mainTask.lat, mainTask.lng);
          setDistance(Math.round(d));
          setIsNear(d <= (mainTask.promien_metry || 50));
        }
      }
    );
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // metry
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const handleStartMain = async () => {
    if (!isNear) return Alert.alert("Za daleko!", "Musisz podejść bliżej punktu rozpoczęcia.");
    
    const { error } = await supabase.from('team_tasks').upsert({
      team_id: team.id,
      task_id: mainTask.id,
      status: 'w_toku',
      rozpoczecie_zadania: new Date().toISOString()
    });
    
    if (!error) loadTasks();
  };

  const handleSubmit = async (taskId: string) => {
    setSubmitting(true);
    const { error } = await supabase.from('team_tasks').update({
      status: 'do_oceny',
      przeslano_zadanie: new Date().toISOString(),
      odpowiedz_tekst: answer
    }).eq('team_id', team.id).eq('task_id', taskId);

    if (!error) {
      setAnswer('');
      Alert.alert("Wysłano!", "Sędzia sprawdza Twoje zadanie.");
      loadTasks();
    }
    setSubmitting(false);
  };

  if (loading) return <ActivityIndicator style={{marginTop: 50}} color="#ff4757" />;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionTitle}>ZADANIE GŁÓWNE</Text>
      
      {mainTask ? (
        <View style={styles.cardMain}>
          {/* Faza 1: Dojazd do miejsca */}
          {!mainTask.team_tasks.find((r: any) => r.team_id === team.id)?.rozpoczecie_zadania ? (
            <View>
              <Text style={styles.locationTitle}>📍 CEL: {mainTask.miejsce_opis}</Text>
              <Text style={styles.distText}>Dystans: {distance ? `${distance}m` : 'Szukam sygnału...'}</Text>
              <Text style={styles.info}>Podejdź do miejsca, aby odkryć treść zadania i uruchomić timer.</Text>
              
              <TouchableOpacity 
                style={[styles.btnStart, !isNear && styles.btnDisabled]} 
                onPress={handleStartMain}
                disabled={!isNear}
              >
                <Text style={styles.btnText}>{isNear ? "ROZPOCZNIJ ZADANIE" : "JESTEŚ ZA DALEKO"}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Faza 2: Wykonywanie (Timer leci) */
            <View>
              <Text style={styles.activeTitle}>{mainTask.tytul}</Text>
              <Text style={styles.desc}>{mainTask.opis}</Text>
              
              <TextInput 
                style={styles.input} 
                placeholder="Twoja odpowiedź..." 
                placeholderTextColor="#666"
                value={answer}
                onChangeText={setAnswer}
                multiline
              />

              <TouchableOpacity style={styles.btnSubmit} onPress={() => handleSubmit(mainTask.id)} disabled={submitting}>
                <Text style={styles.btnText}>WYŚLIJ DO SĘDZIEGO</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        <Text style={styles.allDone}>Wszystkie zadania główne z zestawu wykonane! 🏆</Text>
      )}

      <Text style={[styles.sectionTitle, { marginTop: 30 }]}>SIDEQUESTY (DOSTĘPNE ZAWSZE)</Text>
      {sideQuests.map(sq => (
        <View key={sq.id} style={styles.cardSide}>
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
  cardMain: { backgroundColor: '#111', padding: 20, borderRadius: 20, borderWidth: 1, borderColor: '#333' },
  locationTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  distText: { color: '#2ed573', fontWeight: 'bold', marginBottom: 10 },
  info: { color: '#666', fontSize: 12, marginBottom: 20 },
  activeTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 10 },
  desc: { color: '#ccc', lineHeight: 22, marginBottom: 20 },
  allDone: { color: '#2ed573', textAlign: 'center', fontWeight: 'bold', marginTop: 20 },
  btnStart: { backgroundColor: '#3742fa', padding: 18, borderRadius: 12, alignItems: 'center' },
  btnDisabled: { backgroundColor: '#222' },
  btnSubmit: { backgroundColor: '#ff4757', padding: 18, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  input: { backgroundColor: '#000', color: '#fff', padding: 15, borderRadius: 10, marginVertical: 20, borderWidth: 1, borderColor: '#222' },
  cardSide: { backgroundColor: '#0a0a0a', padding: 15, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#111' },
  sideTitle: { color: '#aaa', fontWeight: 'bold' },
  sideDesc: { color: '#555', fontSize: 12, marginTop: 5 }
});