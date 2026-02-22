import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { supabase } from '@/supabase';

export default function JudgingTab() {
  const [submissions, setSubmissions] = useState<any[]>([]);

  useEffect(() => {
    fetchSubmissions();
    const sub = supabase.channel('judging_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_tasks' }, () => fetchSubmissions())
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

  const fetchSubmissions = async () => {
    const { data } = await supabase
      .from('team_tasks')
      .select('*, teams(nazwa), tasks(*)')
      .eq('status', 'do_oceny')
      .order('przeslano_zadanie', { ascending: true });
    if (data) setSubmissions(data);
  };

  const calculateNetTime = (item: any) => {
    const start = new Date(item.rozpoczecie_zadania).getTime();
    const end = new Date(item.przeslano_zadanie).getTime();
    const pause = item.suma_pauzy_ms || 0;
    
    const netMs = (end - start) - pause;
    const netMin = Math.floor(netMs / 1000 / 60);
    const netSec = Math.floor((netMs / 1000) % 60);
    
    return { totalMin: netMin, display: `${netMin}m ${netSec}s` };
  };

  const getSuggestedBonus = (netMin: number, task: any) => {
    if (task.gate_5_min && netMin <= task.gate_5_min) return 5;
    if (task.gate_4_min && netMin <= task.gate_4_min) return 4;
    if (task.gate_3_min && netMin <= task.gate_3_min) return 3;
    if (task.gate_2_min && netMin <= task.gate_2_min) return 2;
    if (task.gate_1_min && netMin <= task.gate_1_min) return 1;
    return 0;
  };

  const handleVerdict = async (item: any, approved: boolean) => {
    if (approved) {
      const { totalMin } = calculateNetTime(item);
      const bonus = getSuggestedBonus(totalMin, item.tasks);
      const finalPoints = item.tasks.punkty_bazowe + bonus;

      // 1. Aktualizacja statusu zadania
      await supabase.from('team_tasks').update({ 
        status: 'zaakceptowane', 
        przyznane_punkty: finalPoints 
      }).eq('id', item.id);

      // 2. Dodanie punktów drużynie
      await supabase.rpc('increment_team_points', { team_id: item.team_id, amount: finalPoints });

      // 3. JEŚLI TO BYŁO ZADANIE SPECJALNE -> Odpauzuj zadanie główne!
      if (item.tasks.typ === 'special_event') {
        const now = new Date().getTime();
        const pauseStart = new Date(item.rozpoczecie_zadania).getTime(); // Dla uproszczenia liczymy od startu specjalnego
        const pauseDuration = now - pauseStart;

        // Pobierz aktualnie zapauzowane zadanie główne
        const { data: mainTask } = await supabase
          .from('team_tasks')
          .select('*')
          .eq('team_id', item.team_id)
          .eq('status', 'w_toku')
          .not('ostatnia_pauza_start', 'is', null)
          .single();

        if (mainTask) {
          await supabase.from('team_tasks').update({
            suma_pauzy_ms: (mainTask.suma_pauzy_ms || 0) + pauseDuration,
            ostatnia_pauza_start: null
          }).eq('id', mainTask.id);
        }
      }
    } else {
      // Odrzucenie - pozwala wysłać ponownie, czas leci dalej
      await supabase.from('team_tasks').update({ status: 'odrzucone' }).eq('id', item.id);
    }
    fetchSubmissions();
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>OCENA ZADAŃ ⚖️</Text>
      {submissions.map(item => {
        const { display, totalMin } = calculateNetTime(item);
        const bonus = getSuggestedBonus(totalMin, item.tasks);

        return (
          <View key={item.id} style={styles.card}>
            <Text style={styles.teamName}>{item.teams.nazwa}</Text>
            <Text style={styles.taskTitle}>{item.tasks.tytul}</Text>
            
            <View style={styles.timeBox}>
              <Text style={styles.timeLabel}>CZAS NETTO (PO PAUZACH):</Text>
              <Text style={styles.timeValue}>{display}</Text>
              <Text style={styles.bonusLabel}>SUGEROWANY BONUS: +{bonus} PKT</Text>
            </View>

            <Text style={styles.answerLabel}>ODPOWIEDŹ:</Text>
            <Text style={styles.answerText}>{item.odpowiedz_tekst || "Brak tekstu"}</Text>

            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.rejectBtn} onPress={() => handleVerdict(item, false)}>
                <Text style={styles.btnText}>ODRZUĆ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.acceptBtn} onPress={() => handleVerdict(item, true)}>
                <Text style={[styles.btnText, {color: '#000'}]}>ZATWIERDŹ (+{item.tasks.punkty_bazowe + bonus} PKT)</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', padding: 20 },
  title: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  card: { backgroundColor: '#111', padding: 20, borderRadius: 20, marginBottom: 20, borderWidth: 1, borderColor: '#222' },
  teamName: { color: '#ff4757', fontWeight: 'bold', fontSize: 12, letterSpacing: 2 },
  taskTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginVertical: 5 },
  timeBox: { backgroundColor: '#1a1a1a', padding: 15, borderRadius: 12, marginVertical: 15, borderLeftWidth: 3, borderLeftColor: '#2ed573' },
  timeLabel: { color: '#555', fontSize: 9, fontWeight: 'bold' },
  timeValue: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  bonusLabel: { color: '#2ed573', fontSize: 11, fontWeight: 'bold', marginTop: 5 },
  answerLabel: { color: '#444', fontSize: 10, fontWeight: 'bold', marginTop: 10 },
  answerText: { color: '#ccc', marginVertical: 10 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  acceptBtn: { flex: 2, backgroundColor: '#2ed573', padding: 15, borderRadius: 12, alignItems: 'center' },
  rejectBtn: { flex: 1, backgroundColor: '#333', padding: 15, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 }
});