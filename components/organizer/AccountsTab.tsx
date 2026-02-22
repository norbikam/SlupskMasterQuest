import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, FlatList, ActivityIndicator, 
  TouchableOpacity, Modal, TextInput, Alert, ScrollView 
} from 'react-native';
import { supabase } from '@/supabase';
import { Profile, UserRole, Team } from '@/types';

export default function AccountsTab() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);

  // Stan formularza
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pseudonim, setPseudonim] = useState('');
  const [login, setLogin] = useState('');
  const [haslo, setHaslo] = useState('');
  const [rola, setRola] = useState<UserRole>('gracz');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [isLeader, setIsLeader] = useState(false); // NOWE POLE
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [pRes, tRes] = await Promise.all([
      supabase.from('profiles').select('*').order('imie_pseudonim'),
      supabase.from('teams').select('*').order('nazwa')
    ]);

    if (pRes.data) setProfiles(pRes.data);
    if (tRes.data) setTeams(tRes.data);
    setLoading(false);
  };

  const openEditModal = (profile: Profile) => {
    setEditingId(profile.id);
    setPseudonim(profile.imie_pseudonim);
    setLogin(profile.login || '');
    setHaslo(profile.haslo || '');
    setRola(profile.rola);
    setSelectedTeamId(profile.team_id || null);
    setIsLeader(profile.is_leader || false); // Wczytujemy status lidera
    setModalVisible(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setPseudonim('');
    setLogin('');
    setHaslo('');
    setRola('gracz');
    setSelectedTeamId(null);
    setIsLeader(false);
    setModalVisible(false);
  };

  const handleSave = async () => {
    if (!pseudonim || !login || !haslo) return Alert.alert("Błąd", "Wypełnij dane logowania!");
    setSaving(true);

    const payload = {
      imie_pseudonim: pseudonim.trim(),
      login: login.trim(),
      haslo: haslo.trim(),
      rola: rola,
      team_id: selectedTeamId,
      is_leader: isLeader, // Zapisujemy status lidera
    };

    let error;
    if (editingId) {
      const { error: err } = await supabase.from('profiles').update(payload).eq('id', editingId);
      error = err;
    } else {
      const { error: err } = await supabase.from('profiles').insert([payload]);
      error = err;
    }

    if (error) {
      Alert.alert("Błąd", error.message);
    } else {
      Alert.alert("Sukces", "Zapisano zmiany w profilu.");
      resetForm();
      fetchData();
    }
    setSaving(false);
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      "Usuwanie konta",
      `Czy na pewno chcesz usunąć użytkownika ${name}?`,
      [
        { text: "Anuluj", style: "cancel" },
        { 
          text: "USUŃ", 
          style: "destructive", 
          onPress: async () => {
            const { error } = await supabase.from('profiles').delete().eq('id', id);
            if (!error) fetchData();
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Text style={styles.title}>ZARZĄDZANIE KONTAMI</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
          <Text style={styles.addBtnText}>+ NOWY</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#ff4757" style={{marginTop: 50}} />
      ) : (
        <FlatList
          data={profiles}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.name}>{item.imie_pseudonim}</Text>
                  {item.is_leader && <View style={styles.leaderBadge}><Text style={styles.leaderBadgeText}>LIDER</Text></View>}
                </View>
                <Text style={styles.sub}>Log: {item.login} | Has: {item.haslo}</Text>
                <Text style={styles.roleText}>{item.rola.toUpperCase()}</Text>
                {item.team_id && (
                  <Text style={styles.teamTag}>
                    Team: {teams.find(t => t.id === item.team_id)?.nazwa || 'Nieznany'}
                  </Text>
                )}
              </View>
              <View style={styles.actions}>
                <TouchableOpacity style={styles.editBtn} onPress={() => openEditModal(item)}>
                  <Text style={styles.actionText}>EDYTUJ</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.delBtn} onPress={() => handleDelete(item.id, item.imie_pseudonim)}>
                  <Text style={styles.actionText}>USUŃ</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingId ? 'EDYTUJ GRACZA' : 'NOWY GRACZ'}</Text>
            
            <Text style={styles.label}>NAZWA / PSEUDONIM:</Text>
            <TextInput style={styles.input} value={pseudonim} onChangeText={setPseudonim} placeholder="np. Komandor" placeholderTextColor="#444" />
            
            <View style={{flexDirection: 'row', gap: 10}}>
              <View style={{flex: 1}}>
                <Text style={styles.label}>LOGIN:</Text>
                <TextInput style={styles.input} value={login} onChangeText={setLogin} placeholder="Login" placeholderTextColor="#444" autoCapitalize="none" />
              </View>
              <View style={{flex: 1}}>
                <Text style={styles.label}>HASŁO:</Text>
                <TextInput style={styles.input} value={haslo} onChangeText={setHaslo} placeholder="Hasło" placeholderTextColor="#444" />
              </View>
            </View>
            
            <Text style={styles.label}>ROLA:</Text>
            <View style={styles.roleRow}>
              {(['gracz', 'agent', 'impostor', 'detektyw', 'organizator'] as UserRole[]).map(r => (
                <TouchableOpacity 
                  key={r} 
                  style={[styles.roleBtn, rola === r && styles.roleBtnActive]} 
                  onPress={() => setRola(r)}
                >
                  <Text style={[styles.roleBtnText, rola === r && {color: '#fff'}]}>{r.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* SEKCOJA LIDERA */}
            <Text style={styles.label}>UPRAWNIENIA W DRUŻYNIE:</Text>
            <TouchableOpacity 
              style={[styles.toggleBtn, isLeader && styles.toggleBtnActive]} 
              onPress={() => setIsLeader(!isLeader)}
            >
              <Text style={[styles.toggleBtnText, isLeader && {color: '#000'}]}>
                {isLeader ? "STATUS: LIDER ZESPOŁU ⭐" : "STATUS: CZŁONEK ZESPOŁU"}
              </Text>
            </TouchableOpacity>

            <Text style={styles.label}>DRUŻYNA:</Text>
            <View style={styles.teamPicker}>
              <TouchableOpacity 
                style={[styles.teamOption, selectedTeamId === null && styles.teamOptionActive]} 
                onPress={() => setSelectedTeamId(null)}
              >
                <Text style={styles.teamOptionText}>SOLO</Text>
              </TouchableOpacity>
              {teams.map(team => (
                <TouchableOpacity 
                  key={team.id} 
                  style={[styles.teamOption, selectedTeamId === team.id && styles.teamOptionActive]} 
                  onPress={() => setSelectedTeamId(team.id)}
                >
                  <Text style={styles.teamOptionText}>{team.nazwa}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>ZAPISZ PROFIL</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={resetForm} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>ANULUJ</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', padding: 20 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  addBtn: { backgroundColor: '#ff4757', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 },
  addBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  card: { backgroundColor: '#111', padding: 15, borderRadius: 15, marginBottom: 12, flexDirection: 'row', borderLeftWidth: 4, borderLeftColor: '#222' },
  name: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  leaderBadge: { backgroundColor: '#ffd700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 10 },
  leaderBadgeText: { color: '#000', fontSize: 8, fontWeight: 'bold' },
  sub: { color: '#444', fontSize: 11, marginTop: 4 },
  roleText: { color: '#555', fontSize: 9, fontWeight: 'bold', marginTop: 5, letterSpacing: 1 },
  teamTag: { color: '#2ed573', fontSize: 10, marginTop: 2, fontWeight: 'bold' },
  actions: { gap: 8 },
  editBtn: { backgroundColor: '#222', padding: 8, borderRadius: 6, alignItems: 'center' },
  delBtn: { backgroundColor: '#1a0000', padding: 8, borderRadius: 6, alignItems: 'center' },
  actionText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#111', padding: 25, borderRadius: 25, borderWidth: 1, borderColor: '#333' },
  modalTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 25, textAlign: 'center' },
  label: { color: '#444', fontSize: 10, fontWeight: 'bold', marginBottom: 8, marginTop: 15 },
  input: { backgroundColor: '#000', color: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#222' },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleBtn: { padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#222' },
  roleBtnActive: { backgroundColor: '#ff4757', borderColor: '#ff4757' },
  roleBtnText: { color: '#444', fontSize: 10, fontWeight: 'bold' },
  
  toggleBtn: { backgroundColor: '#111', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#333', alignItems: 'center' },
  toggleBtnActive: { backgroundColor: '#ffd700', borderColor: '#ffd700' },
  toggleBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },

  teamPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  teamOption: { backgroundColor: '#000', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#222' },
  teamOptionActive: { borderColor: '#2ed573', backgroundColor: '#0a1a0a' },
  teamOptionText: { color: '#fff', fontSize: 11 },
  saveBtn: { backgroundColor: '#2ed573', padding: 18, borderRadius: 15, alignItems: 'center', marginTop: 30 },
  saveBtnText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
  closeBtn: { marginTop: 20, alignItems: 'center' },
  closeBtnText: { color: '#444', fontSize: 12 }
});