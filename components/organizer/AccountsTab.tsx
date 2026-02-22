import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { supabase } from '@/supabase';
import { Profile } from '@/types';

export default function AccountsTab() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfiles();

    // Odświeżanie na żywo, gdy ktoś nowy dołączy
    const sub = supabase.channel('profiles_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchProfiles())
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, []);

  const fetchProfiles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('imie_pseudonim', { ascending: true });

    if (error) console.error("Błąd profili:", error.message);
    if (data) setProfiles(data);
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>LISTA UCZESTNIKÓW ({profiles.length})</Text>
      {loading ? (
        <ActivityIndicator color="#ff4757" />
      ) : (
        <FlatList
          data={profiles}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View>
                <Text style={styles.name}>{item.imie_pseudonim}</Text>
                <Text style={styles.role}>ROLA: {item.rola.toUpperCase()}</Text>
              </View>
              <View style={styles.statusBox}>
                <Text style={[styles.teamStatus, { color: item.team_id ? '#2ed573' : '#ff4757' }]}>
                  {item.team_id ? 'W DRUŻYNIE' : 'BEZ DRUŻYNY'}
                </Text>
                {item.is_leader && <Text style={styles.leaderBadge}>LIDER</Text>}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', padding: 20 },
  title: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 20 },
  card: { 
    backgroundColor: '#111', 
    padding: 15, 
    borderRadius: 12, 
    marginBottom: 10, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#222'
  },
  name: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  role: { color: '#555', fontSize: 10, fontWeight: 'bold', marginTop: 4 },
  statusBox: { alignItems: 'flex-end' },
  teamStatus: { fontSize: 10, fontWeight: 'bold' },
  leaderBadge: { backgroundColor: '#3742fa', color: '#fff', fontSize: 8, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, marginTop: 5, fontWeight: 'bold' }
});