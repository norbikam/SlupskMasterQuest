import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { supabase } from '@/supabase';

export default function Leaderboard() {
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();

    const channel = supabase.channel('leaderboard_advanced')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_tasks' }, () => fetchData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchData = async () => {
    // 1. Pobieramy drużyny (w tym nową kolumnę target_main_tasks)
    const { data: teamsData } = await supabase
      .from('teams')
      .select('id, nazwa, punkty, target_main_tasks')
      .order('punkty', { ascending: false });

    if (teamsData) {
      const teamsWithProgress = await Promise.all(teamsData.map(async (team) => {
        // 2. Liczymy ukończone zadania GŁÓWNE dla tej konkretnej drużyny
        const { count } = await supabase
          .from('team_tasks')
          .select('id, tasks!inner(typ)', { count: 'exact', head: true })
          .eq('team_id', team.id)
          .eq('status', 'zaakceptowane')
          .eq('tasks.typ', 'glowne');

        return {
          ...team,
          completedMain: count || 0
        };
      }));

      setTeams(teamsWithProgress);
    }
    setLoading(false);
  };

  if (loading) return <ActivityIndicator color="#ff4757" style={{ marginTop: 20 }} />;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>RANKING I POSTĘP OPERACJI 🏆</Text>
      
      {teams.map((item, index) => {
        // Obliczamy postęp na podstawie indywidualnego celu drużyny
        const target = item.target_main_tasks || 8; // domyślnie 8 jeśli nie ustawiono
        const progress = item.completedMain / target;
        const isFinished = item.completedMain >= target;

        return (
          <View key={item.id} style={[styles.teamRow, isFinished && styles.rowFinished]}>
            <View style={styles.teamInfo}>
              <Text style={styles.teamName}>
                {index === 0 ? '🥇 ' : index === 1 ? '🥈 ' : index === 2 ? '🥉 ' : ''}
                {item.nazwa}
              </Text>
              <Text style={styles.teamPoints}>{item.punkty} pkt</Text>
            </View>

            <View style={styles.progressSection}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>CEL GŁÓWNY</Text>
                <Text style={styles.progressValue}>
                  {isFinished ? "UKOŃCZONO!" : `${item.completedMain} / ${target}`}
                </Text>
              </View>
              <View style={styles.progressBarBg}>
                <View 
                  style={[
                    styles.progressBarFill, 
                    { 
                      width: `${Math.min(progress * 100, 100)}%`, 
                      backgroundColor: isFinished ? '#2ed573' : '#3742fa' 
                    }
                  ]} 
                />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#111', padding: 15, borderRadius: 15, marginVertical: 10 },
  title: { color: '#666', fontWeight: 'bold', textAlign: 'center', marginBottom: 20, fontSize: 10, letterSpacing: 2 },
  teamRow: { marginBottom: 15, backgroundColor: '#0a0a0a', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#222' },
  rowFinished: { borderColor: '#2ed573' },
  teamInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  teamName: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  teamPoints: { color: '#2ed573', fontWeight: 'bold', fontSize: 16 },
  progressSection: { width: '100%' },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { color: '#444', fontSize: 9, fontWeight: 'bold' },
  progressValue: { color: '#aaa', fontSize: 9, fontWeight: 'bold' },
  progressBarBg: { height: 8, backgroundColor: '#1a1a1a', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 4 }
});