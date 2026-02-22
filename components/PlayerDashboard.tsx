import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, Text, View, TouchableOpacity, 
  ActivityIndicator, SafeAreaView, Platform, Alert, TextInput, Modal
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import MapView, { Marker, Circle } from 'react-native-maps';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '@/supabase';
import { Profile, Team } from '@/types';

// Komponenty podrzędne
import TasksPlayerView from '@/components/TasksPlayerView';
import Leaderboard from '@/components/Leaderboard';
import GlobalAlertModal from '@/components/GlobalAlertModal';
import SpecialEventModal from '@/components/SpecialEventModal';
import GroupChat from '@/components/GroupChat';

interface Props {
  userProfile: Profile;
  onLogout: () => void;
}

export default function PlayerDashboard({ userProfile: initialProfile, onLogout }: Props) {
  const [userProfile, setUserProfile] = useState<Profile>(initialProfile);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'tasks' | 'ranking' | 'map' | 'chat'>('tasks');
  const [mapTasks, setMapTasks] = useState<any[]>([]);
  
  // Stany dla QR i formularzy
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');

  // Pobierz zadania na mapę przy ładowaniu
  useEffect(() => {
    if (team?.aktywny_zestaw_id) {
      supabase
        .from('tasks')
        .select('id, tytul, latitude, longitude, promien_metry, typ')
        .eq('zestaw_id', team.aktywny_zestaw_id)
        .not('latitude', 'is', null)
        .then(({ data }) => { if (data) setMapTasks(data); });
    }
  }, [team?.aktywny_zestaw_id]);

  useEffect(() => {
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
    if (userProfile.team_id) {
      fetchTeamData(userProfile.team_id);
    } else {
      setTeam(null);
      setLoading(false);
    }
  }, [userProfile.team_id]);

  const fetchTeamData = async (teamId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .eq('id', teamId)
      .maybeSingle();

    if (data) setTeam(data as Team);
    setLoading(false);
  };

  // LOGIKA SKANOWANIA
  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (!scanning) return;
    setScanning(false);
    setLoading(true);

    // Sprawdzamy czy zeskanowany tekst to ID drużyny (UUID) lub kod
    const { data: teamData, error: teamError } = await supabase
      .from('teams')
      .select('id, nazwa')
      .eq('kod_dolaczenia', data.trim().toUpperCase())
      .single();

    if (teamError || !teamData) {
      Alert.alert("Błąd QR", "Nie rozpoznano kodu drużyny.");
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ team_id: teamData.id })
      .eq('id', userProfile.id);

    if (updateError) {
      Alert.alert("Błąd", "Nie udało się dołączyć do drużyny.");
    } else {
      Alert.alert("Sukces", `Dołączono do drużyny ${teamData.nazwa}!`);
    }
    setLoading(false);
  };

  const startScanner = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert("Brak uprawnień", "Musisz zezwolić na dostęp do aparatu, aby skanować QR.");
        return;
      }
    }
    setScanning(true);
  };

  // LOGIKA DLA LIDERA: Tworzenie
  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return Alert.alert("Błąd", "Podaj nazwę drużyny!");
    setLoading(true);

    const generatedCode = (Math.random().toString(36).substring(2, 5) + Math.random().toString(10).substring(2, 5)).toUpperCase();

    const { data: newTeam, error: createError } = await supabase
      .from('teams')
      .insert([{ 
        nazwa: newTeamName.trim(), 
        kod_dolaczenia: generatedCode,
        punkty: 0,
        target_main_tasks: 8 
      }])
      .select()
      .single();

    if (createError || !newTeam) {
      Alert.alert("Błąd", "Nie udało się utworzyć drużyny.");
      setLoading(false);
      return;
    }

    await supabase.from('profiles').update({ team_id: newTeam.id }).eq('id', userProfile.id);
    setLoading(false);
  };

  if (loading && userProfile.team_id && !team) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ff4757" />
        <Text style={styles.loadingText}>SYNCHRONIZACJA...</Text>
      </View>
    );
  }

  // WIDOK: BRAK DRUŻYNY
  if (!userProfile.team_id || !team) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.noTeamBox}>
          <Text style={styles.noTeamTitle}>WITAJ, {userProfile.imie_pseudonim.toUpperCase()}</Text>
          
          {userProfile.is_leader ? (
            <View style={styles.joinCard}>
              <Text style={styles.label}>JESTEŚ LIDEREM - UTWÓRZ DRUŻYNĘ:</Text>
              <TextInput 
                style={styles.input}
                placeholder="NAZWA DRUŻYNY"
                placeholderTextColor="#444"
                value={newTeamName}
                onChangeText={setNewTeamName}
              />
              <TouchableOpacity style={[styles.btnJoin, {backgroundColor: '#2ed573'}]} onPress={handleCreateTeam}>
                <Text style={styles.btnText}>ZAŁÓŻ ZESPÓŁ</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.joinCard}>
              <Text style={styles.label}>ZESKANUJ KOD QR OD SWOJEGO LIDERA:</Text>
              <TouchableOpacity style={styles.btnJoin} onPress={startScanner}>
                <Text style={styles.btnText}>📷 SKANUJ KOD QR</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity onPress={onLogout} style={styles.logoutLink}>
            <Text style={styles.logoutLinkText}>WYLOGUJ MNIE</Text>
          </TouchableOpacity>
        </View>

        {/* MODAL SKANERA */}
        <Modal visible={scanning} animationType="slide">
          <CameraView 
            style={styles.scanner} 
            onBarcodeScanned={handleBarCodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          >
            <View style={styles.scannerOverlay}>
              <View style={styles.scannerFrame} />
              <TouchableOpacity style={styles.cancelScan} onPress={() => setScanning(false)}>
                <Text style={styles.cancelScanText}>ANULUJ</Text>
              </TouchableOpacity>
            </View>
          </CameraView>
        </Modal>
      </SafeAreaView>
    );
  }

  // WIDOK: GŁÓWNY PANEL
  return (
    <SafeAreaView style={styles.container}>
      <GlobalAlertModal />
      <SpecialEventModal userProfile={userProfile} />

      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.teamName}>{team.nazwa.toUpperCase()}</Text>
          <Text style={styles.playerName}>{userProfile.imie_pseudonim} ({userProfile.rola})</Text>
          <View style={styles.qrContainer}>
            <QRCode value={team.kod_dolaczenia} size={60} backgroundColor="transparent" color="white" />
            <Text style={styles.codeInfo}>{team.kod_dolaczenia}</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreValue}>{team.punkty} PKT</Text>
          </View>
          <TouchableOpacity onPress={onLogout} style={styles.smallLogoutBtn}>
            <Text style={styles.smallLogoutText}>WYJDŹ</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {activeTab === 'tasks' && <TasksPlayerView team={team} userProfile={userProfile} />}
        {activeTab === 'ranking' && <Leaderboard />}
        {activeTab === 'map' && (
          <MapView
            style={{ flex: 1 }}
            initialRegion={{ latitude: 54.4641, longitude: 17.0285, latitudeDelta: 0.06, longitudeDelta: 0.06 }}
            showsUserLocation
            showsMyLocationButton
          >
            {mapTasks.map((t: any) => (
              <React.Fragment key={t.id}>
                <Circle
                  center={{ latitude: t.latitude, longitude: t.longitude }}
                  radius={t.promien_metry || 50}
                  fillColor={t.typ === 'glowne' ? 'rgba(55,66,250,0.2)' : 'rgba(46,213,115,0.2)'}
                  strokeColor={t.typ === 'glowne' ? '#3742fa' : '#2ed573'}
                  strokeWidth={2}
                />
                <Marker
                  coordinate={{ latitude: t.latitude, longitude: t.longitude }}
                  pinColor={t.typ === 'glowne' ? '#3742fa' : '#2ed573'}
                  title={t.tytul}
                />
              </React.Fragment>
            ))}
          </MapView>
        )}
        {activeTab === 'chat' && (
          <GroupChat
            channel={userProfile.rola === 'impostor' ? 'impostor' : userProfile.rola === 'detektyw' ? 'detektyw' : 'agenci'}
            userProfile={userProfile}
          />
        )}
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('tasks')}>
          <Text style={[styles.tabIcon, activeTab === 'tasks' && styles.tabActive]}>🎯</Text>
          <Text style={[styles.tabLabel, activeTab === 'tasks' && styles.tabActive]}>MISJE</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('ranking')}>
          <Text style={[styles.tabIcon, activeTab === 'ranking' && styles.tabActive]}>🏆</Text>
          <Text style={[styles.tabLabel, activeTab === 'ranking' && styles.tabActive]}>RANKING</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('map')}>
          <Text style={[styles.tabIcon, activeTab === 'map' && styles.tabActive]}>🗺️</Text>
          <Text style={[styles.tabLabel, activeTab === 'map' && styles.tabActive]}>MAPA</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('chat')}>
          <Text style={[styles.tabIcon, activeTab === 'chat' && styles.tabActive]}>💬</Text>
          <Text style={[styles.tabLabel, activeTab === 'chat' && styles.tabActive]}>CZAT</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#444', marginTop: 15, fontWeight: 'bold' },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    padding: 20, 
    borderBottomWidth: 1, 
    borderBottomColor: '#111',
    alignItems: 'flex-start',
    paddingTop: Platform.OS === 'android' ? 40 : 10
  },
  headerRight: { alignItems: 'flex-end' },
  teamName: { color: '#ff4757', fontWeight: 'bold', fontSize: 18 },
  playerName: { color: '#555', fontSize: 10, fontWeight: 'bold' },
  qrContainer: { marginTop: 10, alignItems: 'center', alignSelf: 'flex-start', padding: 5, backgroundColor: '#111', borderRadius: 8 },
  codeInfo: { color: '#fff', fontSize: 10, fontWeight: 'bold', marginTop: 5, letterSpacing: 2 },
  scoreBox: { backgroundColor: '#111', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  scoreValue: { color: '#2ed573', fontSize: 14, fontWeight: 'bold' },
  smallLogoutBtn: { marginTop: 8, padding: 5 },
  smallLogoutText: { color: '#333', fontSize: 9, fontWeight: 'bold', textDecorationLine: 'underline' },
  noTeamBox: { flex: 1, justifyContent: 'center', padding: 30 },
  noTeamTitle: { color: '#fff', fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  joinCard: { backgroundColor: '#111', padding: 25, borderRadius: 20, borderWidth: 1, borderColor: '#222', marginTop: 20 },
  label: { color: '#ff4757', fontSize: 10, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  input: { backgroundColor: '#000', color: '#fff', padding: 15, borderRadius: 12, fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#333' },
  btnJoin: { backgroundColor: '#fff', padding: 18, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#000', fontWeight: 'bold' },
  logoutLink: { marginTop: 40, alignItems: 'center' },
  logoutLinkText: { color: '#444', fontSize: 12, textDecorationLine: 'underline' },
  tabBar: { flexDirection: 'row', backgroundColor: '#0a0a0a', paddingBottom: Platform.OS === 'ios' ? 25 : 15, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#111' },
  tabItem: { flex: 1, alignItems: 'center' },
  tabIcon: { fontSize: 20, opacity: 0.3 },
  tabLabel: { color: '#444', fontSize: 9, fontWeight: 'bold' },
  tabActive: { color: '#fff', opacity: 1 },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // Scanner
  scanner: { flex: 1 },
  scannerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  scannerFrame: { width: 250, height: 250, borderWidth: 2, borderColor: '#ff4757', borderRadius: 20, backgroundColor: 'transparent' },
  cancelScan: { marginTop: 40, backgroundColor: '#fff', paddingHorizontal: 30, paddingVertical: 15, borderRadius: 12 },
  cancelScanText: { color: '#000', fontWeight: 'bold' }
});