import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator, Platform, KeyboardAvoidingView } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { supabase } from '@/supabase';
import { Task, TaskType } from '@/types';

const DOSTEPNE_ZESTAWY = Array.from({ length: 11 }, (_, i) => `Zestaw_${i}`);

export default function TasksTab() {
  const [activeSubTab, setActiveSubTab] = useState<'dodaj' | 'lista'>('dodaj');

  // Stan formularza (używany do dodawania i edycji)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [miejsceOpis, setMiejsceOpis] = useState('');
  const [zestawId, setZestawId] = useState('Zestaw_1');
  const [taskPoints, setTaskPoints] = useState('10');
  const [taskPenalty, setTaskPenalty] = useState('0'); 
  const [taskType, setTaskType] = useState<TaskType>('glowne');
  const [markerCoords, setMarkerCoords] = useState<{latitude: number, longitude: number} | null>(null);
  const [mapRegion, setMapRegion] = useState({ latitude: 54.4641, longitude: 17.0285, latitudeDelta: 0.02, longitudeDelta: 0.02 });
  const [gates, setGates] = useState({ g5: '', g4: '', g3: '', g2: '', g1: '' });
  
  const [tasksList, setTasksList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'glowne': true, 'specjalne': true, 'sidequest': true
  });

  useEffect(() => { fetchTasks(); }, []);

  const fetchTasks = async () => {
    setLoading(true);
    const { data } = await supabase.from('tasks').select('*').order('utworzono_w', { ascending: false });
    if (data) setTasksList(data);
    setLoading(false);
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const resetForm = () => {
    setEditingTaskId(null);
    setTaskTitle('');
    setTaskDesc('');
    setMiejsceOpis('');
    setZestawId('Zestaw_1');
    setTaskPoints('10');
    setTaskPenalty('0');
    setTaskType('glowne');
    setMarkerCoords(null);
    setGates({ g5: '', g4: '', g3: '', g2: '', g1: '' });
  };

  const handleEditTask = (task: any) => {
    setEditingTaskId(task.id);
    setTaskTitle(task.tytul || '');
    setTaskDesc(task.opis || '');
    setMiejsceOpis(task.miejsce_opis || '');
    setZestawId(task.zestaw_id || 'Zestaw_1');
    setTaskPoints(String(task.punkty_bazowe || 0));
    setTaskPenalty(String(task.kara_za_odrzucenie || 0));
    setTaskType(task.typ || 'glowne');
    
    if (task.latitude && task.longitude) {
      setMarkerCoords({ latitude: task.latitude, longitude: task.longitude });
      setMapRegion({ latitude: task.latitude, longitude: task.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 });
    } else {
      setMarkerCoords(null);
    }

    setGates({
      g5: task.gate_5_min ? String(task.gate_5_min) : '',
      g4: task.gate_4_min ? String(task.gate_4_min) : '',
      g3: task.gate_3_min ? String(task.gate_3_min) : '',
      g2: task.gate_2_min ? String(task.gate_2_min) : '',
      g1: task.gate_1_min ? String(task.gate_1_min) : ''
    });

    setActiveSubTab('dodaj');
  };

  const handleSaveTask = async () => {
    if (!taskTitle.trim()) return Alert.alert('Błąd', 'Podaj tytuł zadania!');
    if (taskType === 'glowne' && !markerCoords) return Alert.alert('Błąd', 'Zadanie główne wymaga określenia lokalizacji na mapie!');
    
    setIsSubmitting(true);

    const payload = {
      tytul: taskTitle.trim(), 
      opis: taskDesc.trim(), 
      miejsce_opis: taskType !== 'sidequest' ? miejsceOpis.trim() : null,
      zestaw_id: taskType === 'glowne' ? zestawId : null,
      typ: taskType, 
      latitude: markerCoords ? markerCoords.latitude : null, 
      longitude: markerCoords ? markerCoords.longitude : null,
      punkty_bazowe: parseInt(taskPoints) || 0,
      kara_za_odrzucenie: taskType !== 'sidequest' ? (parseInt(taskPenalty) || 0) : 0, 
      gate_5_min: taskType === 'glowne' ? parseInt(gates.g5) || null : null,
      gate_4_min: taskType === 'glowne' ? parseInt(gates.g4) || null : null,
      gate_3_min: taskType === 'glowne' ? parseInt(gates.g3) || null : null,
      gate_2_min: taskType === 'glowne' ? parseInt(gates.g2) || null : null,
      gate_1_min: taskType === 'glowne' ? parseInt(gates.g1) || null : null,
    };

    if (editingTaskId) {
      // AKTUALIZACJA ISTNIEJĄCEGO ZADANIA
      const { error } = await supabase.from('tasks').update(payload).eq('id', editingTaskId);
      setIsSubmitting(false);
      if (error) Alert.alert('Błąd', error.message);
      else {
        Alert.alert('Sukces', 'Zadanie zaktualizowane.');
        resetForm();
        fetchTasks();
        setActiveSubTab('lista');
      }
    } else {
      // TWORZENIE NOWEGO ZADANIA
      const { error } = await supabase.from('tasks').insert([{
        ...payload,
        is_active: false,
        kolejnosc: tasksList.length
      }]);
      setIsSubmitting(false);
      if (error) Alert.alert('Błąd', error.message);
      else {
        Alert.alert('Sukces', 'Zadanie zapisane w bazie (wymaga aktywacji).');
        resetForm();
        fetchTasks();
        setActiveSubTab('lista');
      }
    }
  };

  const toggleTaskActive = async (task: any) => {
    const newState = !task.is_active;
    const updatePayload: any = { is_active: newState };
    if (newState && task.typ === 'special_event') updatePayload.aktywowano_w = new Date().toISOString();

    const { error } = await supabase.from('tasks').update(updatePayload).eq('id', task.id);
    if (!error) {
      if (newState && task.typ === 'special_event') {
        const { data: profiles } = await supabase.from('profiles').select('expo_push_token').not('expo_push_token', 'is', null);
        if (profiles && profiles.length > 0) {
          const messages = profiles.map(p => ({ to: p.expo_push_token, sound: 'default', title: "⚡ NOWE ZADANIE SPECJALNE!", body: `Akcja (5 min): ${task.tytul}` }));
          await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(messages) });
        }
      }
      fetchTasks();
    }
  };

  const usunZadanie = (id: string, tytul: string) => {
    Alert.alert('Usuń', `Czy usunąć zadanie "${tytul}"?`, [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'USUŃ', style: 'destructive', onPress: async () => { await supabase.from('tasks').delete().eq('id', id); fetchTasks(); } }
    ]);
  };

  const moveTask = async (task: any, direction: 'up' | 'down', currentSetTasks: any[]) => {
    const sortedTasks = [...currentSetTasks].sort((a, b) => (a.kolejnosc || 0) - (b.kolejnosc || 0));
    const index = sortedTasks.findIndex(t => t.id === task.id);

    if (direction === 'up' && index > 0) {
      const prevTask = sortedTasks[index - 1];
      const temp = prevTask.kolejnosc || (index - 1);
      await supabase.from('tasks').update({ kolejnosc: task.kolejnosc || index }).eq('id', prevTask.id);
      await supabase.from('tasks').update({ kolejnosc: temp }).eq('id', task.id);
    } else if (direction === 'down' && index < sortedTasks.length - 1) {
      const nextTask = sortedTasks[index + 1];
      const temp = nextTask.kolejnosc || (index + 1);
      await supabase.from('tasks').update({ kolejnosc: task.kolejnosc || index }).eq('id', nextTask.id);
      await supabase.from('tasks').update({ kolejnosc: temp }).eq('id', task.id);
    }
    fetchTasks();
  };

  const specjalne = tasksList.filter(t => t.typ === 'special_event');
  const sidequesty = tasksList.filter(t => t.typ === 'sidequest');
  const glowne = tasksList.filter(t => t.typ === 'glowne').sort((a, b) => (a.kolejnosc || 0) - (b.kolejnosc || 0));
  
  const zestawyGlowne = glowne.reduce((acc, task) => {
    const z = task.zestaw_id || 'Brak zestawu';
    if (!acc[z]) acc[z] = [];
    acc[z].push(task);
    return acc;
  }, {} as Record<string, any[]>);

  const renderTaskItem = (task: any, index: number, zestawTasks: any[] | null = null) => (
    <View key={task.id} style={[styles.card, task.is_active && {borderColor: '#2ed573', borderWidth: 1}]}>
      {zestawTasks && (
        <View style={styles.orderControls}>
          <TouchableOpacity onPress={() => moveTask(task, 'up', zestawTasks)} disabled={index === 0}>
            <Text style={[styles.orderBtn, index === 0 && {opacity: 0.2}]}>▲</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => moveTask(task, 'down', zestawTasks)} disabled={index === zestawTasks.length - 1}>
            <Text style={[styles.orderBtn, index === zestawTasks.length - 1 && {opacity: 0.2}]}>▼</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{flex: 1, paddingLeft: zestawTasks ? 10 : 0}}>
        <Text style={styles.cardTitle}>{task.tytul}</Text>
        <Text style={styles.cardInfo}>
          {task.is_active ? '🟢 AKTYWNE' : '🔴 UKRYTE'} | Pkt: {task.punkty_bazowe}
        </Text>
      </View>

      {/* NOWY BLOK Z PRZYCISKAMI AKCJI */}
      <View style={styles.actionsBox}>
        <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#3498DB'}]} onPress={() => handleEditTask(task)}>
          <Text style={{color: '#fff', fontWeight: 'bold', fontSize: 10}}>EDYTUJ</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, {backgroundColor: task.is_active ? '#333' : '#2ed573'}]} onPress={() => toggleTaskActive(task)}>
          <Text style={{color: task.is_active ? '#fff' : '#000', fontWeight: 'bold', fontSize: 10}}>{task.is_active ? 'DEZAKTYWUJ' : 'AKTYWUJ'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => usunZadanie(task.id, task.tytul)}>
          <Text style={styles.deleteBtnText}>Usuń</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.topTabs}>
        <TouchableOpacity 
          style={[styles.topTabBtn, activeSubTab === 'dodaj' && styles.topTabBtnActive, editingTaskId && {backgroundColor: '#f39c12'}]} 
          onPress={() => { setActiveSubTab('dodaj'); if(!editingTaskId) resetForm(); }}
        >
          <Text style={[styles.topTabTxt, activeSubTab === 'dodaj' && {color: '#000'}]}>
            {editingTaskId ? '✏️ EDYTUJ ZADANIE' : '➕ DODAJ ZADANIE'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.topTabBtn, activeSubTab === 'lista' && styles.topTabBtnActive]} onPress={() => {setActiveSubTab('lista'); fetchTasks(); resetForm();}}>
          <Text style={[styles.topTabTxt, activeSubTab === 'lista' && {color: '#000'}]}>📋 ZARZĄDZAJ</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{flex: 1}} keyboardShouldPersistTaps="handled">
        {activeSubTab === 'dodaj' ? (
          <View style={styles.formBox}>
            <TextInput style={styles.input} placeholder="Tytuł misji..." placeholderTextColor="#666" value={taskTitle} onChangeText={setTaskTitle} />
            
            {taskType !== 'sidequest' && (
              <TextInput style={[styles.input, {height: 60}]} placeholder="Wskazówka dojazdu..." placeholderTextColor="#666" multiline value={miejsceOpis} onChangeText={setMiejsceOpis} />
            )}

            <View style={styles.row}>
              <View style={{flex: 1}}><Text style={styles.label}>PUNKTY BAZOWE:</Text><TextInput style={styles.input} value={taskPoints} onChangeText={setTaskPoints} keyboardType="numeric" /></View>
              {taskType !== 'sidequest' && (
                <View style={{flex: 1}}><Text style={styles.label}>KARA (ODRZUCENIE):</Text><TextInput style={styles.input} value={taskPenalty} onChangeText={setTaskPenalty} keyboardType="numeric" /></View>
              )}
            </View>

            <Text style={styles.label}>TYP ZADANIA:</Text>
            <View style={styles.row}>
              {(['glowne', 'sidequest', 'special_event'] as TaskType[]).map(t => (
                <TouchableOpacity key={t} style={[styles.typeBtn, taskType === t && styles.typeBtnActive]} onPress={() => setTaskType(t)}>
                  <Text style={styles.typeBtnText}>{t === 'glowne' ? 'GŁÓWNE' : t === 'sidequest' ? 'POBOCZNE' : 'SPECJALNE'}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {taskType === 'glowne' && (
              <View style={styles.conditionalSection}>
                <Text style={styles.label}>PRZYPISZ DO ZESTAWU:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.setRow}>
                  {DOSTEPNE_ZESTAWY.map(s => (
                    <TouchableOpacity key={s} style={[styles.setBtn, zestawId === s && styles.setBtnActive]} onPress={() => setZestawId(s)}><Text style={styles.setBtnText}>{s}</Text></TouchableOpacity>
                  ))}
                </ScrollView>
                
                {/* PRZYWRÓCONE BRAMKI CZASOWE */}
                <Text style={styles.label}>BRAMKI CZASU (MINUTY):</Text>
                <View style={styles.row}>
                  <TextInput style={styles.gateInput} placeholder="+5p" placeholderTextColor="#444" value={gates.g5} onChangeText={v => setGates({...gates, g5: v})} keyboardType="numeric" />
                  <TextInput style={styles.gateInput} placeholder="+4p" placeholderTextColor="#444" value={gates.g4} onChangeText={v => setGates({...gates, g4: v})} keyboardType="numeric" />
                  <TextInput style={styles.gateInput} placeholder="+3p" placeholderTextColor="#444" value={gates.g3} onChangeText={v => setGates({...gates, g3: v})} keyboardType="numeric" />
                  <TextInput style={styles.gateInput} placeholder="+2p" placeholderTextColor="#444" value={gates.g2} onChangeText={v => setGates({...gates, g2: v})} keyboardType="numeric" />
                  <TextInput style={styles.gateInput} placeholder="+1p" placeholderTextColor="#444" value={gates.g1} onChangeText={v => setGates({...gates, g1: v})} keyboardType="numeric" />
                </View>
              </View>
            )}

            {taskType !== 'sidequest' && (
              <>
                <Text style={styles.label}>LOKALIZACJA {taskType === 'special_event' ? '(OPCJONALNIE)' : '(WYMAGANE)'}:</Text>
                <View style={styles.mapContainer}>
                  <MapView style={styles.map} initialRegion={mapRegion} onPress={(e) => setMarkerCoords(e.nativeEvent.coordinate)}>
                    {markerCoords && <Marker coordinate={markerCoords} pinColor="#ff4757" />}
                  </MapView>
                </View>
              </>
            )}
            
            <TextInput style={[styles.input, {height: 80, marginTop: 15}]} placeholder="Treść zadania..." placeholderTextColor="#666" multiline value={taskDesc} onChangeText={setTaskDesc} />
            
            <TouchableOpacity style={[styles.submitBtn, editingTaskId && {backgroundColor: '#f39c12'}]} onPress={handleSaveTask} disabled={isSubmitting}>
              {isSubmitting ? <ActivityIndicator color="#000" /> : <Text style={styles.submitBtnText}>{editingTaskId ? 'ZAPISZ ZMIANY' : 'ZAPISZ (DO AKTYWACJI)'}</Text>}
            </TouchableOpacity>

            {editingTaskId && (
              <TouchableOpacity style={styles.cancelEditBtn} onPress={() => { resetForm(); setActiveSubTab('lista'); }}>
                <Text style={styles.cancelEditTxt}>ANULUJ EDYCJĘ</Text>
              </TouchableOpacity>
            )}
            
            <View style={{height: 40}} /> 
          </View>
        ) : (
          <View style={{paddingBottom: 50}}>
            {loading ? <ActivityIndicator color="#ff4757" style={{marginTop: 50}} /> : (
              <>
                <TouchableOpacity style={styles.sectionHeader} onPress={() => toggleSection('glowne')}>
                  <Text style={styles.sectionTitle}>🎯 ZADANIA GŁÓWNE ({glowne.length})</Text>
                  <Text style={styles.sectionIcon}>{expandedSections['glowne'] ? '▼' : '▶'}</Text>
                </TouchableOpacity>
                {expandedSections['glowne'] && Object.keys(zestawyGlowne).map(zestaw => (
                  <View key={zestaw} style={styles.subSection}>
                    <Text style={styles.subSectionTitle}>{zestaw.toUpperCase()}</Text>
                    {zestawyGlowne[zestaw].map((t: any, i: number) => renderTaskItem(t, i, zestawyGlowne[zestaw]))}
                  </View>
                ))}

                <TouchableOpacity style={styles.sectionHeader} onPress={() => toggleSection('specjalne')}>
                  <Text style={[styles.sectionTitle, {color: '#ffa502'}]}>⚡ ZADANIA SPECJALNE ({specjalne.length})</Text>
                  <Text style={styles.sectionIcon}>{expandedSections['specjalne'] ? '▼' : '▶'}</Text>
                </TouchableOpacity>
                {expandedSections['specjalne'] && specjalne.map((t: any) => renderTaskItem(t, 0))}

                <TouchableOpacity style={styles.sectionHeader} onPress={() => toggleSection('sidequest')}>
                  <Text style={[styles.sectionTitle, {color: '#3498DB'}]}>🧩 SIDEQUESTY ({sidequesty.length})</Text>
                  <Text style={styles.sectionIcon}>{expandedSections['sidequest'] ? '▼' : '▶'}</Text>
                </TouchableOpacity>
                {expandedSections['sidequest'] && sidequesty.map((t: any) => renderTaskItem(t, 0))}
              </>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topTabs: { flexDirection: 'row', backgroundColor: '#111', padding: 10, marginHorizontal: 15, borderRadius: 12, marginBottom: 15 },
  topTabBtn: { flex: 1, padding: 12, alignItems: 'center', borderRadius: 8 },
  topTabBtnActive: { backgroundColor: '#ff4757' },
  topTabTxt: { color: '#888', fontWeight: 'bold', fontSize: 12 },
  
  formBox: { backgroundColor: '#111', padding: 20, marginHorizontal: 15, borderRadius: 20, borderWidth: 1, borderColor: '#222' },
  input: { backgroundColor: '#000', color: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#333' },
  label: { color: '#444', fontSize: 10, fontWeight: 'bold', marginBottom: 8, marginTop: 10, letterSpacing: 1 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  typeBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#1a1a1a', alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  typeBtnActive: { backgroundColor: '#ff4757', borderColor: '#ff4757' },
  typeBtnText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  conditionalSection: { borderTopWidth: 1, borderTopColor: '#222', marginTop: 10, paddingTop: 10 },
  setRow: { flexDirection: 'row', marginBottom: 15 },
  setBtn: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, backgroundColor: '#222', marginRight: 8 },
  setBtnActive: { backgroundColor: '#3742fa' },
  setBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  gateInput: { flex: 1, backgroundColor: '#000', color: '#fff', padding: 10, borderRadius: 8, textAlign: 'center', fontSize: 12, borderWidth: 1, borderColor: '#333' },
  mapContainer: { height: 200, borderRadius: 15, overflow: 'hidden', marginTop: 5, borderWidth: 1, borderColor: '#333' },
  map: { flex: 1 },
  submitBtn: { backgroundColor: '#2ed573', padding: 18, borderRadius: 15, alignItems: 'center', marginTop: 25 },
  submitBtnText: { color: '#000', fontWeight: 'bold', fontSize: 14 },
  cancelEditBtn: { padding: 15, alignItems: 'center', marginTop: 10 },
  cancelEditTxt: { color: '#ff4757', fontWeight: 'bold', fontSize: 12 },
  
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#111', padding: 15, marginHorizontal: 15, marginTop: 10, borderRadius: 10, borderWidth: 1, borderColor: '#222' },
  sectionTitle: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  sectionIcon: { color: '#888', fontSize: 12 },
  subSection: { paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: '#222', marginLeft: 20, marginTop: 10 },
  subSectionTitle: { color: '#555', fontSize: 10, fontWeight: 'bold', marginBottom: 10, letterSpacing: 2 },
  
  card: { backgroundColor: '#0a0a0a', padding: 15, marginHorizontal: 15, marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: '#222', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  cardInfo: { color: '#888', fontSize: 10, marginTop: 4, fontWeight: 'bold' },
  actionsBox: { flexDirection: 'row', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end', width: 100 },
  actionBtn: { padding: 8, borderRadius: 6, minWidth: 70, alignItems: 'center', marginBottom: 5 },
  deleteBtn: { backgroundColor: '#222', padding: 8, borderRadius: 6, marginBottom: 5, minWidth: 70, alignItems: 'center' },
  deleteBtnText: { color: '#ff4757', fontWeight: 'bold', fontSize: 10 },

  orderControls: { justifyContent: 'space-between', marginRight: 10, borderRightWidth: 1, borderRightColor: '#222', paddingRight: 10 },
  orderBtn: { color: '#3498DB', fontSize: 18, paddingVertical: 2 }
});