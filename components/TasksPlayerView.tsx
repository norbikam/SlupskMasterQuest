import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Image, Platform, TextInput
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/supabase';
import { Team, Profile } from '@/types';

interface Props {
  userProfile: Profile;
  team: Team;
}

// Haversine distance in meters
function calcDist(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Format elapsed ms as mm:ss
function fmtMs(ms: number) {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function TasksPlayerView({ userProfile, team }: Props) {
  const [activeTask, setActiveTask] = useState<any>(null);   // bieżące zadanie główne + team_task
  const [sideQuests, setSideQuests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNear, setIsNear] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [gpsStatus, setGpsStatus] = useState('Szukam sygnału GPS...');
  const [answerText, setAnswerText] = useState('');
  const [elapsedMs, setElapsedMs] = useState(0);

  // timer ref
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -------------------------------------------------------
  // Load tasks
  // -------------------------------------------------------
  const loadTasks = async () => {
    setLoading(true);
    if (!team.aktywny_zestaw_id) {
      setSideQuests([]);
      setActiveTask(null);
      setLoading(false);
      return;
    }

    const { data: allTasks } = await supabase
      .from('tasks')
      .select('*, team_tasks(*)')
      .eq('zestaw_id', team.aktywny_zestaw_id)
      .order('kolejnosc', { ascending: true });

    if (allTasks) {
      setSideQuests(allTasks.filter((t: any) => t.typ === 'sidequest'));

      const mains = allTasks
        .filter((t: any) => t.typ === 'glowne')
        .sort((a: any, b: any) => (a.kolejnosc ?? 0) - (b.kolejnosc ?? 0));

      // Znajdź pierwsze, które NIE ma statusu 'zaakceptowane'
      const next = mains.find((t: any) => {
        const rel = (t.team_tasks as any[]).find((r: any) => r.team_id === team.id);
        return !rel || rel.status !== 'zaakceptowane';
      });

      if (next) {
        const tt = (next.team_tasks as any[]).find((r: any) => r.team_id === team.id) || null;
        setActiveTask({ ...next, tt });
      } else {
        setActiveTask(null);
      }
    }
    setLoading(false);
  };

  // -------------------------------------------------------
  // GPS watch
  // -------------------------------------------------------
  useEffect(() => {
    loadTasks();

    const channel = supabase
      .channel(`task_sync_${team.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'team_tasks', filter: `team_id=eq.${team.id}` },
        () => loadTasks()
      )
      .subscribe();

    let locSub: any = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGpsStatus('Brak uprawnień GPS');
        return;
      }
      locSub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5 },
        (loc) => {
          setGpsStatus('GPS Aktywny ✓');
          // sprawdzamy odległość do aktywnego zadania (bierze z closure, więc useRef)
          setActiveTask((prev: any) => {
            if (prev && prev.latitude && prev.longitude) {
              const d = calcDist(
                loc.coords.latitude,
                loc.coords.longitude,
                prev.latitude,
                prev.longitude
              );
              setDistance(Math.round(d));
              setIsNear(d <= (prev.promien_metry || 50));
            }
            return prev;
          });
        }
      );
    })();

    return () => {
      supabase.removeChannel(channel);
      locSub?.remove();
    };
  }, [team.id, team.aktywny_zestaw_id]);

  // -------------------------------------------------------
  // Timer netto
  // -------------------------------------------------------
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    const tt = activeTask?.tt;
    if (tt?.rozpoczecie_zadania && tt?.status === 'w_toku') {
      const tick = () => {
        const start = new Date(tt.rozpoczecie_zadania!).getTime();
        const pauseMs = tt.suma_pauzy_ms || 0;
        const now = Date.now();
        // Jeśli trwa przerwa (special event) – timer zatrzymany
        if (tt.ostatnia_pauza_start) {
          const pausedSince = new Date(tt.ostatnia_pauza_start).getTime();
          setElapsedMs(now - start - pauseMs - (now - pausedSince));
        } else {
          setElapsedMs(now - start - pauseMs);
        }
      };
      tick();
      timerRef.current = setInterval(tick, 1000);
    } else {
      setElapsedMs(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeTask?.tt?.rozpoczecie_zadania, activeTask?.tt?.status, activeTask?.tt?.suma_pauzy_ms]);

  // -------------------------------------------------------
  // Actions
  // -------------------------------------------------------
  const handleStartTask = async () => {
    if (!isNear) return Alert.alert('Za daleko!', 'Musisz być na miejscu, aby rozpocząć misję.');
    const now = new Date().toISOString();

    const existing = activeTask?.tt;
    if (existing) {
      await supabase
        .from('team_tasks')
        .update({ status: 'w_toku', rozpoczecie_zadania: now })
        .eq('id', existing.id);
    } else {
      await supabase.from('team_tasks').insert({
        team_id: team.id,
        task_id: activeTask.id,
        status: 'w_toku',
        rozpoczecie_zadania: now,
        suma_pauzy_ms: 0,
      });
    }
    loadTasks();
  };

  const handleSubmitTask = async () => {
    if (!answerText.trim() && !activeTask?.tt?.dowod_url) {
      return Alert.alert('Brak odpowiedzi', 'Opisz wykonanie zadania lub wyślij dowód (foto/wideo).');
    }
    const now = new Date().toISOString();
    await supabase
      .from('team_tasks')
      .update({
        status: 'do_oceny',
        przeslano_zadanie: now,
        odpowiedz_tekst: answerText.trim() || null,
      })
      .eq('id', activeTask.tt.id);
    Alert.alert('Wysłano!', 'Czekaj na werdykt sędziego.');
    setAnswerText('');
    loadTasks();
  };

  const handleFileUpload = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: false,
      quality: 0.5,
    });
    if (result.canceled) return;

    setUploading(true);
    const asset = result.assets[0];
    try {
      const fileExt = asset.uri.split('.').pop() || 'jpg';
      const isVideo = asset.type === 'video';
      const fileName = `${team.id}/${activeTask.id}_${Date.now()}.${fileExt}`;

      const formData = new FormData();
      formData.append('file', {
        uri: Platform.OS === 'ios' ? asset.uri.replace('file://', '') : asset.uri,
        name: fileName,
        type: isVideo ? 'video/mp4' : 'image/jpeg',
      } as any);

      const { error: storageError } = await supabase.storage
        .from('evidence')
        .upload(fileName, formData);

      if (storageError) throw storageError;

      const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(fileName);

      await supabase
        .from('team_tasks')
        .update({ dowod_url: urlData.publicUrl })
        .eq('id', activeTask.tt.id);

      Alert.alert('Dowód dodany!', 'Możesz teraz nacisnąć "Wyślij do sędziego".');
      loadTasks();
    } catch (error: any) {
      Alert.alert('Błąd uploadu', error.message);
    } finally {
      setUploading(false);
    }
  };

  // -------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------
  const renderActiveTaskContent = () => {
    if (!activeTask) {
      return (
        <View style={styles.allDoneBox}>
          <Text style={styles.allDoneIcon}>🏆</Text>
          <Text style={styles.allDoneText}>Wszystkie misje główne ukończone!</Text>
        </View>
      );
    }

    const tt = activeTask.tt;
    const status = tt?.status || 'aktywne';

    // ──── FAZA 0: BRAK ZESTAWU ────
    if (!team.aktywny_zestaw_id) {
      return (
        <View style={styles.card}>
          <Text style={styles.infoText}>⚠️ Organizator jeszcze nie przypisał zestawu zadań dla Twojej drużyny.</Text>
        </View>
      );
    }

    // ──── FAZA 1: DOJAZD ────
    if (!tt || !tt.rozpoczecie_zadania) {
      return (
        <View style={styles.card}>
          <Text style={styles.phaseLabel}>📍 FAZA: DOJAZD</Text>
          <Text style={styles.locationTitle}>{activeTask.miejsce_opis || 'Udaj się do punktu startowego'}</Text>
          <View style={styles.distBox}>
            <Text style={styles.distLabel}>DYSTANS DO CELU</Text>
            <Text style={styles.distValue}>
              {distance !== null ? `${distance} m` : gpsStatus}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.btnPrimary, !isNear && styles.btnDisabled]}
            onPress={handleStartTask}
            disabled={!isNear}
          >
            <Text style={styles.btnText}>
              {isNear ? '🚀 ROZPOCZNIJ MISJĘ' : '📡 ZA DALEKO...'}
            </Text>
          </TouchableOpacity>
          {isNear && <Text style={styles.hintText}>Jesteś w strefie! Możesz zaczynać.</Text>}
        </View>
      );
    }

    // ──── FAZA 2: DO OCENY (wysłano, czeka na sędziego) ────
    if (status === 'do_oceny') {
      return (
        <View style={styles.card}>
          <Text style={styles.phaseLabel}>⏳ FAZA: OCENA SĘDZIEGO</Text>
          <Text style={styles.taskTitle}>{activeTask.tytul}</Text>
          <View style={styles.pendingBox}>
            <Text style={styles.pendingIcon}>🕵️</Text>
            <Text style={styles.pendingText}>Dowód przesłany. Sędziowie analizują materiał...</Text>
            {tt.odpowiedz_tekst ? (
              <Text style={styles.sentAnswer}>Twoja odpowiedź: &quot;{tt.odpowiedz_tekst}&quot;</Text>
            ) : null}
          </View>
        </View>
      );
    }

    // ──── FAZA 3: ODRZUCONE (wróć, popraw i wyślij ponownie) ────
    if (status === 'odrzucone') {
      return (
        <View style={styles.card}>
          <Text style={[styles.phaseLabel, { color: '#ff4757' }]}>❌ FAZA: ODRZUCONO</Text>
          <Text style={styles.taskTitle}>{activeTask.tytul}</Text>
          {tt.uwagi_sedziego ? (
            <View style={styles.noteBox}>
              <Text style={styles.noteLabel}>UWAGI SĘDZIEGO:</Text>
              <Text style={styles.noteText}>{tt.uwagi_sedziego}</Text>
            </View>
          ) : null}
          <Text style={styles.infoText}>Popraw wykonanie i wyślij ponownie.</Text>
          {renderExecutionForm()}
        </View>
      );
    }

    // ──── FAZA 4: WYKONYWANIE (w_toku) ────
    return (
      <View style={styles.card}>
        <Text style={styles.phaseLabel}>⚡ FAZA: WYKONYWANIE</Text>
        <Text style={styles.taskTitle}>{activeTask.tytul}</Text>
        <Text style={styles.taskDesc}>{activeTask.opis}</Text>

        {/* Timer netto */}
        <View style={styles.timerBox}>
          <Text style={styles.timerLabel}>CZAS NETTO</Text>
          <Text style={[styles.timerValue, tt.ostatnia_pauza_start && styles.timerPaused]}>
            {tt.ostatnia_pauza_start ? '⏸ PAUZOWANY' : `⏱ ${fmtMs(elapsedMs)}`}
          </Text>
        </View>

        {renderExecutionForm()}
      </View>
    );
  };

  const renderExecutionForm = () => {
    const tt = activeTask?.tt;
    return (
      <View>
        {/* Jeśli jest dowód – pokaż miniaturkę */}
        {tt?.dowod_url && (
          <View style={styles.proofBox}>
            <Image source={{ uri: tt.dowod_url }} style={styles.proofThumb} resizeMode="cover" />
            <Text style={styles.proofLabel}>✅ Dowód załadowany</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.btnUpload, uploading && styles.btnDisabled]}
          onPress={handleFileUpload}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.btnUploadText}>📸 {tt?.dowod_url ? 'ZMIEŃ DOWÓD' : 'DODAJ FOTO / WIDEO'}</Text>
          )}
        </TouchableOpacity>

        <TextInput
          style={styles.answerInput}
          placeholder="Opis wykonania / odpowiedź tekstowa..."
          placeholderTextColor="#444"
          multiline
          value={answerText}
          onChangeText={setAnswerText}
        />

        <TouchableOpacity style={styles.btnSubmit} onPress={handleSubmitTask}>
          <Text style={styles.btnSubmitText}>✅ WYŚLIJ DO SĘDZIEGO</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // -------------------------------------------------------
  // Main render
  // -------------------------------------------------------
  if (loading) {
    return <ActivityIndicator style={{ marginTop: 60 }} color="#ff4757" size="large" />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* ── MISJA GŁÓWNA ── */}
      <Text style={styles.sectionTitle}>MISJA GŁÓWNA</Text>
      {renderActiveTaskContent()}

      {/* ── SIDEQUESTY ── */}
      {sideQuests.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 30 }]}>
            SIDEQUESTY (ZAWSZE DOSTĘPNE)
          </Text>
          {sideQuests.map((sq: any) => {
            const ttSq = (sq.team_tasks as any[]).find((r: any) => r.team_id === team.id);
            const isDone = ttSq?.status === 'zaakceptowane';
            return (
              <View key={sq.id} style={[styles.sideCard, isDone && styles.sideCardDone]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={styles.sideTitle}>{sq.tytul}</Text>
                  <Text style={styles.sidePts}>{sq.punkty_bazowe} PKT</Text>
                </View>
                <Text style={styles.sideDesc}>{sq.opis}</Text>
                {isDone && <Text style={styles.doneBadge}>✓ ZALICZONE</Text>}
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', padding: 20 },
  sectionTitle: {
    color: '#ff4757', fontWeight: 'bold', fontSize: 10,
    letterSpacing: 2, marginBottom: 12,
  },

  // Card
  card: {
    backgroundColor: '#111', padding: 20, borderRadius: 20,
    borderWidth: 1, borderColor: '#222',
  },
  phaseLabel: { color: '#ffa502', fontSize: 9, fontWeight: 'bold', letterSpacing: 2, marginBottom: 10 },
  locationTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  taskTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  taskDesc: { color: '#aaa', lineHeight: 20, marginBottom: 20 },
  infoText: { color: '#666', textAlign: 'center', lineHeight: 20 },

  // Distance
  distBox: {
    backgroundColor: '#0a0a0a', padding: 18, borderRadius: 15,
    alignItems: 'center', marginBottom: 20,
  },
  distLabel: { color: '#444', fontSize: 9, fontWeight: 'bold', letterSpacing: 2 },
  distValue: { color: '#2ed573', fontSize: 30, fontWeight: 'bold', marginTop: 4 },

  // Buttons
  btnPrimary: {
    backgroundColor: '#3742fa', padding: 18, borderRadius: 15, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.3 },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  hintText: { color: '#2ed573', textAlign: 'center', marginTop: 10, fontSize: 11, fontWeight: 'bold' },

  // Timer
  timerBox: {
    backgroundColor: '#0a0a0a', padding: 15, borderRadius: 12,
    alignItems: 'center', marginBottom: 20,
  },
  timerLabel: { color: '#444', fontSize: 9, fontWeight: 'bold', letterSpacing: 2 },
  timerValue: { color: '#ffa502', fontSize: 26, fontWeight: 'bold', fontVariant: ['tabular-nums'], marginTop: 4 },
  timerPaused: { color: '#ff4757' },

  // Proof
  proofBox: { marginBottom: 12, alignItems: 'center' },
  proofThumb: { width: '100%', height: 160, borderRadius: 12, backgroundColor: '#1a1a1a' },
  proofLabel: { color: '#2ed573', fontSize: 11, fontWeight: 'bold', marginTop: 6 },

  // Upload
  btnUpload: {
    backgroundColor: '#1a1a1a', padding: 16, borderRadius: 12,
    alignItems: 'center', borderWidth: 1, borderColor: '#333', marginBottom: 12,
  },
  btnUploadText: { color: '#fff', fontWeight: 'bold' },

  // Answer
  answerInput: {
    backgroundColor: '#0a0a0a', color: '#fff', padding: 15, borderRadius: 12,
    borderWidth: 1, borderColor: '#222', minHeight: 80, textAlignVertical: 'top',
    marginBottom: 12,
  },
  btnSubmit: {
    backgroundColor: '#2ed573', padding: 18, borderRadius: 15, alignItems: 'center',
  },
  btnSubmitText: { color: '#000', fontWeight: 'bold', fontSize: 15 },

  // Pending
  pendingBox: { alignItems: 'center', paddingVertical: 20 },
  pendingIcon: { fontSize: 40, marginBottom: 10 },
  pendingText: { color: '#ffa502', fontWeight: 'bold', textAlign: 'center', fontSize: 14 },
  sentAnswer: { color: '#666', marginTop: 10, fontSize: 12, textAlign: 'center' },

  // Note
  noteBox: { backgroundColor: '#1a0000', padding: 12, borderRadius: 10, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#ff4757' },
  noteLabel: { color: '#ff4757', fontSize: 9, fontWeight: 'bold', marginBottom: 4 },
  noteText: { color: '#ccc', fontSize: 13 },

  // All done
  allDoneBox: { alignItems: 'center', paddingVertical: 40 },
  allDoneIcon: { fontSize: 50, marginBottom: 10 },
  allDoneText: { color: '#2ed573', fontWeight: 'bold', fontSize: 16, textAlign: 'center' },

  // Side quests
  sideCard: {
    backgroundColor: '#0a0a0a', padding: 15, borderRadius: 12,
    marginBottom: 10, borderWidth: 1, borderColor: '#111',
  },
  sideCardDone: { borderColor: '#2ed573', opacity: 0.7 },
  sideTitle: { color: '#fff', fontWeight: 'bold', flex: 1 },
  sidePts: { color: '#ffa502', fontWeight: 'bold', fontSize: 12 },
  sideDesc: { color: '#555', fontSize: 12, marginTop: 5 },
  doneBadge: { color: '#2ed573', fontSize: 9, fontWeight: 'bold', marginTop: 6, letterSpacing: 1 },
});
