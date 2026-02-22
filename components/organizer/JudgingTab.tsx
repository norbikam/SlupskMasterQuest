import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { supabase } from '@/supabase';

export default function JudgingTab() {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSubmissions();
    const sub = supabase.channel('judging').on('postgres_changes', { event: '*', schema: 'public', table: 'team_tasks' }, () => fetchSubmissions()).subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

  const fetchSubmissions = async () => {
    const { data } = await supabase
      .from('team_tasks')
      .select('*, teams(nazwa), tasks(*)')
      .eq('status', 'do_oceny')
      .order('przeslano_zadanie', { ascending: true });
    if (data) setSubmissions(data);
    setLoading(false);
  };

  const handleVerdict = async (id: string, approved: boolean, teamId: string, points: number) => {
    const status = approved ? 'zaakceptowane' : 'odrzucone';
    await supabase.from('team_tasks').update({ status, przyznane_punkty: approved ? points : 0 }).eq('id', id);
    if (approved) {
        await supabase.rpc('increment_team_points', { team_id: teamId, amount: points });
    }
    fetchSubmissions();
  };

  if (loading) return <ActivityIndicator color="#ff4757" style={{marginTop: 50}} />;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>OCENA DOWODÓW ⚖️</Text>
      {submissions.length === 0 && <Text style={{color: '#444', textAlign: 'center'}}>Brak nowych zgłoszeń.</Text>}
      {submissions.map(item => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.teamName}>{item.teams?.nazwa} 🚩</Text>
          <Text style={styles.taskTitle}>{item.tasks?.tytul}</Text>
          
          <Text style={styles.label}>DOWÓD:</Text>
          {item.dowod_url ? (
            <Image source={{ uri: item.dowod_url }} style={styles.evidenceImage} resizeMode="cover" />
          ) : (
            <Text style={{color: '#ff4757'}}>Błąd: Brak URL dowodu!</Text>
          )}

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.rejectBtn} onPress={() => handleVerdict(item.id, false, item.team_id, 0)}>
              <Text style={styles.btnText}>ODRZUĆ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.acceptBtn} onPress={() => handleVerdict(item.id, true, item.team_id, item.tasks?.punkty_bazowe || 10)}>
              <Text style={styles.acceptText}>ZATWIERDŹ (+{item.tasks?.punkty_bazowe} PKT)</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', padding: 20 },
  title: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  card: { backgroundColor: '#111', padding: 20, borderRadius: 20, marginBottom: 15, borderWidth: 1, borderColor: '#333' },
  teamName: { color: '#ff4757', fontWeight: 'bold', fontSize: 12 },
  taskTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginTop: 5 },
  label: { color: '#444', fontSize: 10, fontWeight: 'bold', marginTop: 15, marginBottom: 5 },
  evidenceImage: { width: '100%', height: 250, borderRadius: 10, marginBottom: 15 },
  btnRow: { flexDirection: 'row', gap: 10 },
  acceptBtn: { flex: 2, backgroundColor: '#2ed573', padding: 15, borderRadius: 12, alignItems: 'center' },
  rejectBtn: { flex: 1, backgroundColor: '#222', padding: 15, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  acceptText: { color: '#000', fontWeight: 'bold' }
});