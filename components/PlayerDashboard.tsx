import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, Alert, TextInput, Platform, Modal, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '@/supabase';

// Komponenty
import TasksPlayerView from './TasksPlayerView';
import GroupChat from './GroupChat';
import Leaderboard from './Leaderboard';
import GlobalAlertModal from './GlobalAlertModal';
import SpecialEventModal from './SpecialEventModal';

export default function PlayerDashboard({ userProfile: initialProfile, onLogout }: any) {
  const [userProfile, setUserProfile] = useState(initialProfile);
  const [team, setTeam] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'tasks' | 'ranking' | 'chat'>('tasks');
  
  const [scanning, setScanning] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false); // NOWY STAN DLA DUŻEGO QR
  const [permission, requestPermission] = useCameraPermissions();
  const [newTeamName, setNewTeamName] = useState('');

  useEffect(() => {
    const profileSub = supabase.channel(`profile_sync_${userProfile.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userProfile.id}` }, 
      (payload) => {
        setUserProfile(payload.new);
      })
      .subscribe();
    return () => { supabase.removeChannel(profileSub); };
  }, []);

  useEffect(() => {
    if (userProfile.team_id) {
      fetchTeam();
    } else {
      setLoading(false);
    }
  }, [userProfile.team_id]);

  const fetchTeam = async () => {
    setLoading(true);
    const { data } = await supabase.from('teams').select('*').eq('id', userProfile.team_id).single();
    if (data) setTeam(data);
    setLoading(false);
  };

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return Alert.alert('Błąd', 'Podaj nazwę drużyny');
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data, error } = await supabase.from('teams').insert([{ nazwa: newTeamName, kod_dolaczenia: code }]).select().single();
    if (data && !error) {
      await supabase.from('profiles').update({ team_id: data.id }).eq('id', userProfile.id);
      setUserProfile({ ...userProfile, team_id: data.id });
    }
  };

  const onScan = async ({ data }: any) => {
    setScanning(false);
    const { data: t } = await supabase.from('teams').select('id, nazwa').eq('kod_dolaczenia', data.toUpperCase()).single();
    if (t) {
      await supabase.from('profiles').update({ team_id: t.id }).eq('id', userProfile.id);
      setUserProfile({ ...userProfile, team_id: t.id });
      Alert.alert('Sukces', `Dołączono do ${t.nazwa}`);
    } else Alert.alert('Błąd', 'Kod nieprawidłowy lub drużyna nie istnieje');
  };

  const role = userProfile.rola?.toLowerCase();
  const canSeeChat = ['agent', 'impostor', 'detektyw'].includes(role || '');

  if (loading && userProfile.team_id && !team) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ff4757" />
        <Text style={styles.loadingText}>SYNCHRONIZACJA...</Text>
      </View>
    );
  }

  if (!userProfile.team_id) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.title}>WITAJ, {userProfile.imie_pseudonim}</Text>
          {userProfile.is_leader ? (
            <View style={styles.joinCard}>
              <TextInput style={styles.input} placeholder="Nazwa Twojej Drużyny" value={newTeamName} onChangeText={setNewTeamName} placeholderTextColor="#666" />
              <TouchableOpacity style={styles.btnCreate} onPress={handleCreateTeam}><Text style={styles.btnText}>ZAŁÓŻ DRUŻYNĘ</Text></TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.btnScan} onPress={async () => {
              const res = await requestPermission();
              if (res.granted) setScanning(true);
              else Alert.alert("Brak", "Zezwól na aparat.");
            }}><Text style={styles.btnTextBlack}>📷 SKANUJ QR LIDERA</Text></TouchableOpacity>
          )}
          <TouchableOpacity onPress={onLogout} style={styles.logoutBtn}><Text style={{color: '#666', fontWeight: 'bold'}}>WYLOGUJ MNIE</Text></TouchableOpacity>
        </View>
        <Modal visible={scanning} animationType="slide">
          <CameraView style={{ flex: 1 }} onBarcodeScanned={onScan}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
              <View style={{ width: 250, height: 250, borderWidth: 2, borderColor: '#ff4757', borderRadius: 20 }} />
              <TouchableOpacity style={{ marginTop: 40, backgroundColor: '#fff', padding: 15, borderRadius: 10 }} onPress={() => setScanning(false)}>
                <Text style={{color: '#000', fontWeight: 'bold'}}>ANULUJ</Text>
              </TouchableOpacity>
            </View>
          </CameraView>
        </Modal>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <GlobalAlertModal />
      <SpecialEventModal userProfile={userProfile} />

      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.teamName}>{team?.nazwa || 'Ładowanie...'}</Text>
          <Text style={styles.role}>{userProfile.rola.toUpperCase()}</Text>
        </View>
        
        {/* KLIKALNY MAŁY QR CODE DLA LIDERA */}
        {userProfile.is_leader && team && (
          <TouchableOpacity style={styles.qrHeader} onPress={() => setShowQRModal(true)}>
            <QRCode value={team.kod_dolaczenia} size={50} color="white" backgroundColor="black" />
            <Text style={{color: '#2ed573', fontSize: 9, marginTop: 4, fontWeight: 'bold'}}>POWIĘKSZ 🔍</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={{ marginLeft: 15 }} onPress={onLogout}><Text style={styles.logoutSmall}>WYJDŹ</Text></TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
        {activeTab === 'tasks' && <TasksPlayerView team={team} userProfile={userProfile} />}
        {activeTab === 'ranking' && <Leaderboard />}
        {activeTab === 'chat' && canSeeChat && <GroupChat channel={role} userProfile={userProfile} />}
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tab} onPress={() => setActiveTab('tasks')}>
          <Text style={[styles.tabText, activeTab === 'tasks' && styles.activeTab]}>MISJE</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => setActiveTab('ranking')}>
          <Text style={[styles.tabText, activeTab === 'ranking' && styles.activeTab]}>RANKING</Text>
        </TouchableOpacity>
        {canSeeChat && (
          <TouchableOpacity style={styles.tab} onPress={() => setActiveTab('chat')}>
            <Text style={[styles.tabText, activeTab === 'chat' && styles.activeTab]}>CZAT FRAKCJI</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* MODAL Z DUŻYM KODEM QR */}
      {userProfile.is_leader && team && (
        <Modal visible={showQRModal} transparent animationType="fade">
          <View style={styles.qrModalOverlay}>
            <View style={styles.qrModalContent}>
              <Text style={styles.qrModalTitle}>KOD DRUŻYNY</Text>
              <Text style={styles.qrModalSub}>Pokaż ten kod swojemu zespołowi, aby mogli dołączyć.</Text>
              
              <View style={styles.qrBigWrapper}>
                {/* Białe tło ułatwia skanowanie aparatami */}
                <QRCode value={team.kod_dolaczenia} size={220} color="black" backgroundColor="white" />
              </View>
              
              <Text style={styles.qrModalCodeText}>{team.kod_dolaczenia}</Text>
              
              <TouchableOpacity style={styles.qrModalCloseBtn} onPress={() => setShowQRModal(false)}>
                <Text style={styles.qrModalCloseText}>ZAMKNIJ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#444', marginTop: 15, fontWeight: 'bold' },
  center: { flex: 1, justifyContent: 'center', padding: 30 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 30 },
  joinCard: { backgroundColor: '#111', padding: 25, borderRadius: 20, borderWidth: 1, borderColor: '#222' },
  input: { backgroundColor: '#000', color: '#fff', padding: 15, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#333' },
  btnCreate: { backgroundColor: '#2ed573', padding: 18, borderRadius: 15, alignItems: 'center' },
  btnScan: { backgroundColor: '#fff', padding: 18, borderRadius: 15, alignItems: 'center' },
  btnText: { color: '#000', fontWeight: 'bold', fontSize: 14 },
  btnTextBlack: { color: '#000', fontWeight: 'bold', fontSize: 14 },
  logoutBtn: { marginTop: 40, alignItems: 'center', padding: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderColor: '#111', alignItems: 'center', paddingTop: Platform.OS === 'android' ? 40 : 10 },
  teamName: { color: '#ff4757', fontWeight: 'bold', fontSize: 20 },
  role: { color: '#666', fontSize: 11, fontWeight: 'bold', marginTop: 2, letterSpacing: 1 },
  qrHeader: { alignItems: 'center', padding: 5, backgroundColor: '#111', borderRadius: 8 },
  logoutSmall: { color: '#444', fontSize: 12, fontWeight: 'bold', textDecorationLine: 'underline' },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderColor: '#111', paddingBottom: Platform.OS === 'ios' ? 25 : 15, paddingTop: 15, backgroundColor: '#0a0a0a' },
  tab: { flex: 1, alignItems: 'center' },
  tabText: { color: '#555', fontWeight: 'bold', fontSize: 11, letterSpacing: 1 },
  activeTab: { color: '#fff' },
  
  // Style dla Modala QR
  qrModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  qrModalContent: { backgroundColor: '#111', padding: 30, borderRadius: 30, alignItems: 'center', width: '100%', borderWidth: 1, borderColor: '#333' },
  qrModalTitle: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 5 },
  qrModalSub: { color: '#888', fontSize: 12, textAlign: 'center', marginBottom: 25 },
  qrBigWrapper: { backgroundColor: '#fff', padding: 20, borderRadius: 20, marginBottom: 20 },
  qrModalCodeText: { color: '#ff4757', fontSize: 28, fontWeight: 'bold', letterSpacing: 5, marginBottom: 30 },
  qrModalCloseBtn: { backgroundColor: '#333', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 15 },
  qrModalCloseText: { color: '#fff', fontWeight: 'bold' }
});