import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '@/supabase';

export default function GameManagementTab() {
  const [teams, setTeams] = useState<any[]>([]);
  const [sets, setSets] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    // 1. Pobierz unikalne ID zestawów z tabeli zadań
    const { data: tasksData } = await supabase.from('tasks').select('zestaw_id');
    const uniqueSets = Array.from(new Set(tasksData?.map(t => t.zestaw_id).filter(Boolean)));
    setSets(uniqueSets as string[]);

    // 2. Pobierz drużyny
    const { data: teamsData } = await supabase
      .from('teams')
      .select('*')
      .order('nazwa', { ascending: true });
    
    if (teamsData) setTeams(teamsData);
    setLoading(false);
  };

  const updateTeamConfig = async (teamId: string, updates: any) => {
    const { error } = await supabase
      .from('teams')
      .update(updates)
      .eq('id', teamId);

    if (error) {
      Alert.alert("Błąd", "Nie udało się zaktualizować ustawień drużyny.");
    } else {
      setTeams(teams.map(t => t.id === teamId ? { ...t, ...updates } : t));
    }
  };

  if (loading) return <ActivityIndicator color="#ff4757" style={{ marginTop: 50 }} />;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>KONFIGURACJA ZESTAWÓW I CELÓW</Text>
      
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          Pamiętaj: Zestaw musi być najpierw wpisany w edycji zadania jako "zestaw_id", aby pojawił się na tej liście.
        </Text>
      </View>

      {teams.map(team => (
        <View key={team.id} style={styles.teamCard}>
          <Text style={styles.teamName}>{team.nazwa}</Text>
          <Text style={styles.subLabel}>KOD: {team.kod_dolaczenia}</Text>

          {/* Wybór Zestawu */}
          <View style={styles.settingRow}>
            <Text style={styles.label}>PRZYPISANY ZESTAW:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.setPicker}>
              {sets.length === 0 && <Text style={{color: '#444'}}>Brak zdefiniowanych zestawów</Text>}
              {sets.map(setName => (
                <TouchableOpacity 
                  key={setName}
                  style={[styles.setBtn, team.aktywny_zestaw_id === setName && styles.setBtnActive]}
                  onPress={() => updateTeamConfig(team.id, { aktywny_zestaw_id: setName })}
                >
                  <Text style={[styles.setBtnText, team.aktywny_zestaw_id === setName && styles.setBtnTextActive]}>
                    {setName}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Ustawienie Celu Głównego */}
          <View style={styles.settingRow}>
            <Text style={styles.label}>CEL ZADAŃ GŁÓWNYCH:</Text>
            <View style={styles.inputContainer}>
              <TouchableOpacity 
                style={styles.stepBtn} 
                onPress={() => updateTeamConfig(team.id, { target_main_tasks: Math.max(1, (team.target_main_tasks || 8) - 1) })}
              >
                <Text style={styles.stepText}>-</Text>
              </TouchableOpacity>
              
              <TextInput 
                style={styles.input}
                keyboardType="numeric"
                value={String(team.target_main_tasks || 8)}
                onChangeText={(val) => updateTeamConfig(team.id, { target_main_tasks: parseInt(val) || 0 })}
              />

              <TouchableOpacity 
                style={styles.stepBtn} 
                onPress={() => updateTeamConfig(team.id, { target_main_tasks: (team.target_main_tasks || 8) + 1 })}
              >
                <Text style={styles.stepText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ))}

      <View style={{ height: 50 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', padding: 20 },
  header: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 10, letterSpacing: 1 },
  infoBox: { backgroundColor: '#111', padding: 15, borderRadius: 12, marginBottom: 25, borderLeftWidth: 3, borderLeftColor: '#3742fa' },
  infoText: { color: '#666', fontSize: 11, lineHeight: 16 },
  teamCard: { backgroundColor: '#0a0a0a', padding: 20, borderRadius: 20, marginBottom: 20, borderWidth: 1, borderColor: '#222' },
  teamName: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  subLabel: { color: '#444', fontSize: 10, fontWeight: 'bold', marginTop: 4, letterSpacing: 1 },
  settingRow: { marginTop: 20 },
  label: { color: '#555', fontSize: 10, fontWeight: 'bold', marginBottom: 10, letterSpacing: 1 },
  setPicker: { flexDirection: 'row' },
  setBtn: { backgroundColor: '#111', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, marginRight: 8, borderWidth: 1, borderColor: '#222' },
  setBtnActive: { backgroundColor: '#3742fa', borderColor: '#3742fa' },
  setBtnText: { color: '#666', fontWeight: 'bold', fontSize: 12 },
  setBtnTextActive: { color: '#fff' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', alignSelf: 'flex-start', borderRadius: 10, padding: 5 },
  input: { color: '#fff', width: 50, textAlign: 'center', fontWeight: 'bold', fontSize: 18 },
  stepBtn: { width: 35, height: 35, backgroundColor: '#222', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  stepText: { color: '#fff', fontSize: 20, fontWeight: 'bold' }
});