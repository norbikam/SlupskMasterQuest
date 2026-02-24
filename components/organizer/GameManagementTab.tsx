import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '@/supabase';

export default function GameManagementTab() {
  const [teams, setTeams] = useState<any[]>([]);
  const [sets, setSets] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [dropdownOpenFor, setDropdownOpenFor] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: tasksData } = await supabase.from('tasks').select('zestaw_id');
    const uniqueSets = Array.from(new Set(tasksData?.map(t => t.zestaw_id).filter(Boolean)));
    setSets(uniqueSets as string[]);

    const { data: teamsData } = await supabase.from('teams').select('*').order('nazwa', { ascending: true });
    if (teamsData) setTeams(teamsData);
    setLoading(false);
  };

  const updateTeamConfig = async (teamId: string, updates: any) => {
    const { error } = await supabase.from('teams').update(updates).eq('id', teamId);
    if (error) {
      Alert.alert("Błąd", "Nie udało się zaktualizować ustawień drużyny.");
    } else {
      setTeams(teams.map(t => t.id === teamId ? { ...t, ...updates } : t));
    }
  };

  if (loading) return <ActivityIndicator color="#ff4757" style={{ marginTop: 50 }} />;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>KONFIGURACJA ROZGRYWKI</Text>
      
      {teams.map(team => (
        <View key={team.id} style={styles.teamCard}>
          <Text style={styles.teamName}>{team.nazwa}</Text>
          <Text style={styles.subLabel}>KOD: {team.kod_dolaczenia}</Text>

          {/* Wybór Zestawu (DROPDOWN) */}
          <View style={styles.settingRow}>
            <Text style={styles.label}>PRZYPISANY ZESTAW:</Text>
            <TouchableOpacity 
              style={styles.dropdownHeader}
              onPress={() => setDropdownOpenFor(dropdownOpenFor === team.id ? null : team.id)}
            >
              <Text style={styles.dropdownHeaderText}>{team.aktywny_zestaw_id || "Brak zestawu"}</Text>
              <Text style={styles.dropdownArrow}>{dropdownOpenFor === team.id ? '▲' : '▼'}</Text>
            </TouchableOpacity>

            {dropdownOpenFor === team.id && (
              <View style={styles.dropdownList}>
                {sets.length === 0 && <Text style={{color: '#444', padding: 10}}>Brak zestawów w bazie</Text>}
                {sets.map(setName => (
                  <TouchableOpacity 
                    key={setName}
                    style={[styles.dropdownItem, team.aktywny_zestaw_id === setName && styles.dropdownItemActive]}
                    onPress={() => {
                      updateTeamConfig(team.id, { aktywny_zestaw_id: setName });
                      setDropdownOpenFor(null);
                    }}
                  >
                    <Text style={[styles.dropdownItemText, team.aktywny_zestaw_id === setName && {color: '#fff'}]}>{setName}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Ręczna Edycja Punktów */}
          <View style={styles.settingRow}>
            <Text style={styles.label}>PUNKTY DRUŻYNY:</Text>
            <View style={styles.inputContainer}>
              <TouchableOpacity style={styles.stepBtn} onPress={() => updateTeamConfig(team.id, { punkty: (team.punkty || 0) - 1 })}>
                <Text style={styles.stepText}>-</Text>
              </TouchableOpacity>
              <TextInput 
                style={[styles.input, {color: '#2ed573'}]}
                keyboardType="numeric"
                value={String(team.punkty || 0)}
                onChangeText={(val) => updateTeamConfig(team.id, { punkty: parseInt(val) || 0 })}
              />
              <TouchableOpacity style={styles.stepBtn} onPress={() => updateTeamConfig(team.id, { punkty: (team.punkty || 0) + 1 })}>
                <Text style={styles.stepText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Ustawienie Celu Głównego */}
          <View style={styles.settingRow}>
            <Text style={styles.label}>CEL ZADAŃ GŁÓWNYCH:</Text>
            <View style={styles.inputContainer}>
              <TouchableOpacity style={styles.stepBtn} onPress={() => updateTeamConfig(team.id, { target_main_tasks: Math.max(1, (team.target_main_tasks || 8) - 1) })}>
                <Text style={styles.stepText}>-</Text>
              </TouchableOpacity>
              <TextInput 
                style={styles.input}
                keyboardType="numeric"
                value={String(team.target_main_tasks || 8)}
                onChangeText={(val) => updateTeamConfig(team.id, { target_main_tasks: parseInt(val) || 0 })}
              />
              <TouchableOpacity style={styles.stepBtn} onPress={() => updateTeamConfig(team.id, { target_main_tasks: (team.target_main_tasks || 8) + 1 })}>
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
  header: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 20, letterSpacing: 1 },
  teamCard: { backgroundColor: '#0a0a0a', padding: 20, borderRadius: 20, marginBottom: 20, borderWidth: 1, borderColor: '#222' },
  teamName: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  subLabel: { color: '#444', fontSize: 10, fontWeight: 'bold', marginTop: 4, letterSpacing: 1 },
  settingRow: { marginTop: 20 },
  label: { color: '#555', fontSize: 10, fontWeight: 'bold', marginBottom: 10, letterSpacing: 1 },
  
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#111', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#333' },
  dropdownHeaderText: { color: '#fff', fontWeight: 'bold' },
  dropdownArrow: { color: '#888' },
  dropdownList: { backgroundColor: '#1a1a1a', borderRadius: 10, marginTop: 5, overflow: 'hidden', borderWidth: 1, borderColor: '#333' },
  dropdownItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#222' },
  dropdownItemActive: { backgroundColor: '#3742fa' },
  dropdownItemText: { color: '#888', fontWeight: 'bold' },

  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', alignSelf: 'flex-start', borderRadius: 10, padding: 5 },
  input: { color: '#fff', width: 60, textAlign: 'center', fontWeight: 'bold', fontSize: 18 },
  stepBtn: { width: 40, height: 40, backgroundColor: '#222', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  stepText: { color: '#fff', fontSize: 22, fontWeight: 'bold' }
});