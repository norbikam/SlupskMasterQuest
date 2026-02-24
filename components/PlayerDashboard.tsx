import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, Alert, TextInput, Platform, Modal, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/supabase';

// Komponenty
import TasksPlayerView from './TasksPlayerView';
import GroupChat from './GroupChat';
import Leaderboard from './Leaderboard';
import GlobalAlertModal from './GlobalAlertModal';
import SpecialTasksTab from './SpecialTasksTab';
import LocationTracker from './LocationTracker';

export default function PlayerDashboard({ userProfile: initialProfile, onLogout }: any) {
  const [userProfile, setUserProfile] = useState(initialProfile);
  const [team, setTeam] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'tasks' | 'special' | 'ranking' | 'chat'>('tasks');
  
  const [scanning, setScanning] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [newTeamName, setNewTeamName] = useState('');

  // Stan postępu misji głównych
  const [completedTasksCount, setCompletedTasksCount] = useState(0);

  // PRZECHWYTYWANIE POWIADOMIEŃ
  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (lastNotificationResponse) {
      const title = lastNotificationResponse.notification.request.content.title || '';
      if (title.includes('SPECJALNE')) {
        setActiveTab('special');
      }
    }
  }, [lastNotificationResponse]);

  // SUBSKRYPCJE DANYCH
  useEffect(() => {
    const profileSub = supabase.channel(`profile_sync_${userProfile.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userProfile.id}` }, 
      (payload) => { setUserProfile(payload.new); })
      .subscribe();

    let teamSub: any;
    let progressSub: any;

    if (userProfile.team_id) {
        teamSub = supabase.channel(`team_sync_${userProfile.team_id}`)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'teams', filter: `id=eq.${userProfile.team_id}` }, 
          (payload) => { setTeam(payload.new); })
          .subscribe();

        // Nasłuchujemy zmian w wykonywanych zadaniach, żeby pasek postępu odświeżał się na żywo
        progressSub = supabase.channel(`progress_sync_${userProfile.team_id}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'team_tasks', filter: `team_id=eq.${userProfile.team_id}` }, 
          () => { fetchProgress(); })
          .subscribe();
    }

    return () => { 
        supabase.removeChannel(profileSub); 
        if(teamSub) supabase.removeChannel(teamSub);
        if(progressSub) supabase.removeChannel(progressSub);
    };
  }, [userProfile.id, userProfile.team_id]);

  useEffect(() => {
    if (userProfile.team_id) {
      fetchTeam();
    } else {
      setLoading(false);
    }
  }, [userProfile.team_id]);

  useEffect(() => {
    if (team?.id && team?.aktywny_zestaw_id) {
      fetchProgress();
    }
  }, [team?.id, team?.aktywny_zestaw_id]);

  const fetchTeam = async () => {
    setLoading(true);
    const { data } = await supabase.from('teams').select('*').eq('id', userProfile.team_id).single();
    if (data) setTeam(data);
    setLoading(false);
  };

  // LOGIKA WYLICZANIA POSTĘPU (Zadania "za nami")
  const fetchProgress = async () => {
    if (!team?.aktywny_zestaw_id || !team?.id) return;
    
    // 1. Pobieramy ID zadań głównych przypisanych do zestawu drużyny
    const { data: mainTasks } = await supabase.from('tasks')
      .select('id')
      .eq('zestaw_id', team.aktywny_zestaw_id)
      .eq('typ', 'glowne')
      .eq('is_active', true);

    if (!mainTasks || mainTasks.length === 0) return;
    const mainTaskIds = mainTasks.map(t => t.id);

    // 2. Pobieramy relacje drużyny do tych zadań
    const { data: ttData } = await supabase.from('team_tasks')
      .select('task_id, status')
      .eq('team_id', team.id)
      .in('task_id', mainTaskIds);

    if (ttData) {
      // Zliczamy zadania, które mają status uznawany za "przejście dalej"
      // (do_oceny -> wysłane, pominiete -> odrzucone świadomie, zaakceptowane -> zatwierdzone przez sędziego)
      const finished = ttData.filter(tt => ['zaakceptowane', 'pominiete', 'do_oceny'].includes(tt.status));
      setCompletedTasksCount(finished.length);
    }
  };

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return Alert.alert('Błąd', 'Podaj nazwę drużyny');
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data, error } = await supabase.from('teams').insert([{ nazwa: newTeamName, kod_dolaczenia: code, punkty: 0 }]).select().single();
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

  // Obliczenie szerokości paska postępu (od 0 do 100%)
  const targetTasks = team?.target_main_tasks || 8;
  const progressPercent = Math.min(100, Math.max(0, (completedTasksCount / targetTasks) * 100));

  return (
    <SafeAreaView style={styles.container}>
      <GlobalAlertModal />

      <View style={styles.header}>
        {/* Lewa strona (Nazwa i QR) */}
        <View style={{ flex: 1 }}>
          <Text style={styles.teamName}>{team?.nazwa || 'Ładowanie...'}</Text>
          <Text style={styles.role}>{userProfile.rola.toUpperCase()}</Text>
        </View>
        {userProfile.is_leader && team && (
            <TouchableOpacity style={styles.qrHeader} onPress={() => setShowQRModal(true)}>
              <QRCode value={team.kod_dolaczenia} size={64} color="white" backgroundColor="black" />
              <Text style={{color: '#2ed573', fontSize: 8, marginTop: 4, fontWeight: 'bold'}}>POWIĘKSZ</Text>
            </TouchableOpacity>
          )}
        
        {/* Prawa strona (Punkty i pasek postępu) */}
        <View style={styles.headerRight}>
            <View style={styles.scoreBox}>
                <Text style={styles.scoreLabel}>PUNKTY</Text>
                <Text style={styles.scoreValue}>{team?.punkty || 0}</Text>
                
                {/* Pasek postępu zadań */}
                <View style={{ width: '100%', marginTop: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={styles.progressLabel}>MISJE</Text>
                    <Text style={styles.progressLabel}>{completedTasksCount} / {targetTasks}</Text>
                  </View>
                  <View style={styles.progressBarContainer}>
                      <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
                  </View>
                </View>

            </View>

            <TouchableOpacity style={{ marginTop: 10 }} onPress={onLogout}>
                <Text style={styles.logoutSmall}>WYJDŹ</Text>
            </TouchableOpacity>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {activeTab === 'tasks' && <TasksPlayerView team={team} userProfile={userProfile} />}
        {activeTab === 'special' && <SpecialTasksTab team={team} userProfile={userProfile} />}
        {activeTab === 'ranking' && <Leaderboard />}
        {activeTab === 'chat' && canSeeChat && <GroupChat channel={role} userProfile={userProfile} />}
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('tasks')}>
          <Text style={[styles.tabIcon, activeTab === 'tasks' && styles.tabActive]}>🎯</Text>
          <Text style={[styles.tabLabel, activeTab === 'tasks' && styles.tabActive]}>MISJE</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('special')}>
          <Text style={[styles.tabIcon, activeTab === 'special' && styles.tabActive]}>⚡</Text>
          <Text style={[styles.tabLabel, activeTab === 'special' && styles.tabActive, {color: '#ffa502'}]}>AKCJA</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('ranking')}>
          <Text style={[styles.tabIcon, activeTab === 'ranking' && styles.tabActive]}>🏆</Text>
          <Text style={[styles.tabLabel, activeTab === 'ranking' && styles.tabActive]}>RANKING</Text>
        </TouchableOpacity>
        
        {canSeeChat && (
          <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('chat')}>
            <Text style={[styles.tabIcon, activeTab === 'chat' && styles.tabActive]}>💬</Text>
            <Text style={[styles.tabLabel, activeTab === 'chat' && styles.tabActive]}>FRAKCJA</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* MODAL QR */}
      {userProfile.is_leader && team && (
        <Modal visible={showQRModal} transparent animationType="fade">
          <View style={styles.qrModalOverlay}>
            <View style={styles.qrModalContent}>
              <Text style={styles.qrModalTitle}>KOD DRUŻYNY</Text>
              <Text style={styles.qrModalSub}>Pokaż ten kod swojemu zespołowi, aby mogli dołączyć.</Text>
              <View style={styles.qrBigWrapper}>
                <QRCode value={team.kod_dolaczenia} size={220} color="black" backgroundColor="white" />
              </View>
              <Text style={styles.qrModalCodeText}>{team.nazwa}</Text>
              <TouchableOpacity style={styles.qrModalCloseBtn} onPress={() => setShowQRModal(false)}>
                <Text style={styles.qrModalCloseText}>ZAMKNIJ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    <LocationTracker teamId={team.id}/>
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
  
  // HEADER
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderColor: '#111', alignItems: 'flex-start', paddingTop: Platform.OS === 'android' ? 40 : 10 },
  headerRight: { alignItems: 'flex-end', minWidth: 120 },
  teamName: { color: '#ff4757', fontWeight: 'bold', fontSize: 20 },
  role: { color: '#666', fontSize: 11, fontWeight: 'bold', marginTop: 2, letterSpacing: 1 },
  qrHeader: { alignItems: 'center', padding: 5, backgroundColor: '#111', borderRadius: 8, marginRight: 20, alignSelf: 'flex-start' },
  logoutSmall: { color: '#444', fontSize: 11, fontWeight: 'bold', textDecorationLine: 'underline' },
  
  // SCORE BOX
  scoreBox: { backgroundColor: '#111', padding: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#222', width: '100%' },
  scoreLabel: { color: '#888', fontSize: 9, fontWeight: 'bold', letterSpacing: 1 },
  scoreValue: { color: '#2ed573', fontSize: 24, fontWeight: 'bold', marginTop: 2 },
  
  // PROGRESS BAR
  progressLabel: { color: '#888', fontSize: 8, fontWeight: 'bold' },
  progressBarContainer: { width: '100%', height: 6, backgroundColor: '#222', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#3498DB' }, // Zmieniłem na niebieski, żeby odróżniał się od punktów

  // TAB BAR
  tabBar: { flexDirection: 'row', backgroundColor: '#0a0a0a', paddingBottom: Platform.OS === 'ios' ? 25 : 15, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#111' },
  tabItem: { flex: 1, alignItems: 'center' },
  tabIcon: { fontSize: 20, opacity: 0.3, marginBottom: 4 },
  tabLabel: { color: '#555', fontSize: 9, fontWeight: 'bold', letterSpacing: 1 },
  tabActive: { color: '#fff', opacity: 1 },
  
  // MODAL QR
  qrModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  qrModalContent: { backgroundColor: '#111', padding: 30, borderRadius: 30, alignItems: 'center', width: '100%', borderWidth: 1, borderColor: '#333' },
  qrModalTitle: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 5 },
  qrModalSub: { color: '#888', fontSize: 12, textAlign: 'center', marginBottom: 25 },
  qrBigWrapper: { backgroundColor: '#fff', padding: 20, borderRadius: 20, marginBottom: 20 },
  qrModalCodeText: { color: '#ff4757', fontSize: 28, fontWeight: 'bold', letterSpacing: 5, marginBottom: 30 },
  qrModalCloseBtn: { backgroundColor: '#333', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 15 },
  qrModalCloseText: { color: '#fff', fontWeight: 'bold' }
});