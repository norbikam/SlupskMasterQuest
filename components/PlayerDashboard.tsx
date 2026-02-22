import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, Text, View, TouchableOpacity, 
  ActivityIndicator, SafeAreaView, Platform, Alert, TextInput 
} from 'react-native';
import { supabase } from '@/supabase';
import { Profile, Team } from '@/types';

// Komponenty podrzędne
import TasksPlayerView from '@/components/TasksPlayerView';
import Leaderboard from '@/components/Leaderboard';
import GlobalAlertModal from '@/components/GlobalAlertModal';
import SpecialEventModal from '@/components/SpecialEventModal';

interface Props {
  userProfile: Profile;
  onLogout: () => void;
}

export default function PlayerDashboard({ userProfile: initialProfile, onLogout }: Props) {
  const [userProfile, setUserProfile] = useState<Profile>(initialProfile);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'tasks' | 'ranking' | 'map'>('tasks');
  const [joinCode, setJoinCode] = useState('');

  useEffect(() => {
    // 1. Subskrypcja profilu - reaguje na zmiany roli lub team_id od Admina
    const profileSub = supabase.channel(`profile_sync_${userProfile.id}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'profiles', 
        filter: `id=eq.${userProfile.id}` 
      }, (payload) => {
        setUserProfile(payload.new as Profile);
      })
      .subscribe();

    return () => { supabase.removeChannel(profileSub); };
  }, []);

  useEffect(() => {
    // 2. Pobierz dane drużyny, jeśli gracz ma przypisane team_id
    if (userProfile.team_id) {
      fetchTeamData(userProfile.team_id);
    } else {
      setTeam(null);
      setLoading(false);
    }
  }, [userProfile.team_id]);

  const fetchTeamData = async (teamId: string) => {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .eq('id', teamId)
      .single();

    if (data) setTeam(data as Team);
    setLoading(false);
  };

  const handleJoinTeam = async () => {
    if (!joinCode.trim()) return;
    setLoading(true);

    // Szukamy drużyny po kodzie
    const { data: teamData, error: teamError } = await supabase
      .from('teams')
      .select('id')
      .eq('kod_dolaczenia', joinCode.trim().toUpperCase())
      .single();

    if (teamError || !teamData) {
      Alert.alert("Błąd", "Nieprawidłowy kod drużyny.");
      setLoading(false);
      return;
    }

    // Przypisujemy gracza do drużyny
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ team_id: teamData.id })
      .eq('id', userProfile.id);

    if (updateError) {
      Alert.alert("Błąd", "Nie udało się dołączyć do drużyny.");
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ff4757" />
        <Text style={styles.loadingText}>SYNCHRONIZACJA Z BAZĄ...</Text>
      </View>
    );
  }

  // WIDOK: BRAK DRUŻYNY
  if (!userProfile.team_id || !team) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.noTeamBox}>
          <Text style={styles.noTeamTitle}>WITAJ, {userProfile.imie_pseudonim.toUpperCase()}</Text>
          <Text style={styles.noTeamSub}>Nie jesteś jeszcze w żadnej drużynie operacyjnej.</Text>
          
          <View style={styles.joinCard}>
            <Text style={styles.label}>WPISZ KOD DRUŻYNY:</Text>
            <TextInput 
              style={styles.input}
              placeholder="NP. ALFA-123"
              placeholderTextColor="#444"
              autoCapitalize="characters"
              value={joinCode}
              onChangeText={setJoinCode}
            />
            <TouchableOpacity style={styles.btnJoin} onPress={handleJoinTeam}>
              <Text style={styles.btnText}>DOŁĄCZ DO EKIPY</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={onLogout} style={styles.logoutLink}>
            <Text style={styles.logoutLinkText}>WYLOGUJ</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // WIDOK: GŁÓWNY DASHBOARD GRACZA
  return (
    <SafeAreaView style={styles.container}>
      {/* MODALE SPECJALNE (Zawsze na wierzchu) */}
      <GlobalAlertModal />
      <SpecialEventModal userProfile={userProfile} />

      {/* HEADER: INFO O DRUŻYNIE */}
      <View style={styles.header}>
        <View>
          <Text style={styles.teamName}>{team.nazwa.toUpperCase()}</Text>
          <Text style={styles.playerName}>{userProfile.imie_pseudonim} ({userProfile.rola})</Text>
        </View>
        <View style={styles.scoreBox}>
          <Text style={styles.scoreLabel}>PUNKTY</Text>
          <Text style={styles.scoreValue}>{team.punkty}</Text>
        </View>
      </View>

      {/* GŁÓWNA TREŚĆ (ZALEŻNA OD TABU) */}
      <View style={{ flex: 1 }}>
        {activeTab === 'tasks' && <TasksPlayerView team={team} userProfile={userProfile} />}
        {activeTab === 'ranking' && <Leaderboard />}
        {activeTab === 'map' && <View style={styles.placeholder}><Text style={{color: '#fff'}}>Mapa w przygotowaniu...</Text></View>}
      </View>

      {/* NAWIGACJA DOLNA */}
      <View style={styles.tabBar}>
        <TouchableOpacity 
          style={styles.tabItem} 
          onPress={() => setActiveTab('tasks')}
        >
          <Text style={[styles.tabIcon, activeTab === 'tasks' && styles.tabActive]}>🎯</Text>
          <Text style={[styles.tabLabel, activeTab === 'tasks' && styles.tabActive]}>MISJE</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.tabItem} 
          onPress={() => setActiveTab('ranking')}
        >
          <Text style={[styles.tabIcon, activeTab === 'ranking' && styles.tabActive]}>🏆</Text>
          <Text style={[styles.tabLabel, activeTab === 'ranking' && styles.tabActive]}>RANKING</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.tabItem} 
          onPress={() => setActiveTab('map')}
        >
          <Text style={[styles.tabIcon, activeTab === 'map' && styles.tabActive]}>🗺️</Text>
          <Text style={[styles.tabLabel, activeTab === 'map' && styles.tabActive]}>MAPA</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#444', marginTop: 15, fontWeight: 'bold', letterSpacing: 1 },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    padding: 20, 
    borderBottomWidth: 1, 
    borderBottomColor: '#111',
    paddingTop: Platform.OS === 'android' ? 40 : 10
  },
  teamName: { color: '#ff4757', fontWeight: 'black', fontSize: 20, letterSpacing: 1 },
  playerName: { color: '#555', fontSize: 12, fontWeight: 'bold' },
  scoreBox: { alignItems: 'flex-end', backgroundColor: '#111', paddingHorizontal: 15, paddingVertical: 5, borderRadius: 10 },
  scoreLabel: { color: '#444', fontSize: 8, fontWeight: 'bold' },
  scoreValue: { color: '#2ed573', fontSize: 18, fontWeight: 'bold' },
  
  // No Team Styles
  noTeamBox: { flex: 1, justifyContent: 'center', padding: 30 },
  noTeamTitle: { color: '#fff', fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  noTeamSub: { color: '#666', textAlign: 'center', marginTop: 10, marginBottom: 40 },
  joinCard: { backgroundColor: '#111', padding: 25, borderRadius: 25, borderWidth: 1, borderColor: '#222' },
  label: { color: '#ff4757', fontSize: 10, fontWeight: 'bold', marginBottom: 10, letterSpacing: 1 },
  input: { backgroundColor: '#000', color: '#fff', padding: 15, borderRadius: 12, fontSize: 18, fontWeight: 'bold', textAlign: 'center', borderWidth: 1, borderColor: '#333', marginBottom: 20 },
  btnJoin: { backgroundColor: '#fff', padding: 18, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#000', fontWeight: 'bold' },
  logoutLink: { marginTop: 30, alignItems: 'center' },
  logoutLinkText: { color: '#333', fontSize: 12, fontWeight: 'bold', textDecorationLine: 'underline' },

  // Tabs
  tabBar: { flexDirection: 'row', backgroundColor: '#0a0a0a', borderTopWidth: 1, borderTopColor: '#111', paddingBottom: Platform.OS === 'ios' ? 25 : 10, paddingTop: 10 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabIcon: { fontSize: 20, opacity: 0.4 },
  tabLabel: { color: '#444', fontSize: 9, fontWeight: 'bold', marginTop: 4 },
  tabActive: { color: '#fff', opacity: 1 },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});