import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { supabase } from '@/supabase';
import { Task, TaskType } from '@/types';

const DOSTEPNE_ZESTAWY = Array.from({ length: 11 }, (_, i) => `Zestaw_${i}`);

export default function TasksTab() {
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [miejsceOpis, setMiejsceOpis] = useState('');
  const [zestawId, setZestawId] = useState('Zestaw_1');
  const [taskPoints, setTaskPoints] = useState('10');
  const [taskPenalty, setTaskPenalty] = useState('0'); 
  const [taskType, setTaskType] = useState<TaskType>('glowne');
  
  const [markerCoords, setMarkerCoords] = useState<{latitude: number, longitude: number} | null>(null);
  const [mapRegion, setMapRegion] = useState({
    latitude: 54.4641, 
    longitude: 17.0285,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  });

  const [gates, setGates] = useState({ g5: '', g4: '', g3: '', g2: '', g1: '' });

  const [tasksList, setTasksList] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    setLoading(true);
    const { data } = await supabase.from('tasks').select('*').order('utworzono_w', { ascending: false });
    if (data) setTasksList(data);
    setLoading(false);
  };

  const handleCreateTask = async () => {
    if (!taskTitle.trim() || !markerCoords) {
      return Alert.alert('Błąd', 'Podaj tytuł i wybierz miejsce na mapie!');
    }
    
    setIsSubmitting(true);
    const { error } = await supabase.from('tasks').insert([{
      tytul: taskTitle.trim(),
      opis: taskDesc.trim(),
      miejsce_opis: miejsceOpis.trim(),
      zestaw_id: taskType === 'glowne' ? zestawId : null,
      typ: taskType,
      latitude: markerCoords.latitude,
      longitude: markerCoords.longitude,
      punkty_bazowe: parseInt(taskPoints) || 0,
      kara_za_odrzucenie: parseInt(taskPenalty) || 0, 
      gate_5_min: taskType === 'glowne' ? parseInt(gates.g5) || null : null,
      gate_4_min: taskType === 'glowne' ? parseInt(gates.g4) || null : null,
      gate_3_min: taskType === 'glowne' ? parseInt(gates.g3) || null : null,
      gate_2_min: taskType === 'glowne' ? parseInt(gates.g2) || null : null,
      gate_1_min: taskType === 'glowne' ? parseInt(gates.g1) || null : null,
    }]);

    setIsSubmitting(false);
    if (error) {
      Alert.alert('Błąd', error.message);
    } else {
      Alert.alert('Sukces', 'Zadanie dodane!');
      setTaskTitle(''); setTaskDesc(''); setMiejsceOpis(''); setMarkerCoords(null);
      fetchTasks();
    }
  };

  // PRZYWRÓCONA FUNKCJA USUWANIA
  const usunZadanie = (id: string, tytul: string) => {
    Alert.alert(
      'Usuń Zadanie',
      `Czy na pewno chcesz na zawsze usunąć zadanie "${tytul}"?`,
      [
        { text: 'Anuluj', style: 'cancel' },
        { 
          text: 'USUŃ', 
          style: 'destructive', 
          onPress: async () => {
            const { error } = await supabase.from('tasks').delete().eq('id', id);
            if (error) Alert.alert('Błąd', error.message);
            else fetchTasks();
          } 
        }
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionTitle}>NOWE ZADANIE</Text>
      
      <View style={styles.formBox}>
        <TextInput style={styles.input} placeholder="Tytuł misji..." placeholderTextColor="#666" value={taskTitle} onChangeText={setTaskTitle} />
        <TextInput style={[styles.input, {height: 60}]} placeholder="Wskazówka dojazdu (np. Czerwona brama przy rzece)" placeholderTextColor="#666" multiline value={miejsceOpis} onChangeText={setMiejsceOpis} />

        <View style={styles.row}>
          <View style={{flex: 1}}>
            <Text style={styles.label}>PUNKTY BAZOWE:</Text>
            <TextInput style={styles.input} value={taskPoints} onChangeText={setTaskPoints} keyboardType="numeric" />
          </View>
          <View style={{flex: 1}}>
            <Text style={styles.label}>KARA (ODRZUCENIE):</Text>
            <TextInput style={styles.input} value={taskPenalty} onChangeText={setTaskPenalty} keyboardType="numeric" />
          </View>
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
                <TouchableOpacity key={s} style={[styles.setBtn, zestawId === s && styles.setBtnActive]} onPress={() => setZestawId(s)}>
                  <Text style={styles.setBtnText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.label}>BRAMKI CZASU (MAX MINUTY DLA BONUSU):</Text>
            <View style={styles.row}>
              <TextInput style={styles.gateInput} placeholder="+5p" placeholderTextColor="#444" onChangeText={v => setGates({...gates, g5: v})} keyboardType="numeric" />
              <TextInput style={styles.gateInput} placeholder="+4p" placeholderTextColor="#444" onChangeText={v => setGates({...gates, g4: v})} keyboardType="numeric" />
              <TextInput style={styles.gateInput} placeholder="+3p" placeholderTextColor="#444" onChangeText={v => setGates({...gates, g3: v})} keyboardType="numeric" />
              <TextInput style={styles.gateInput} placeholder="+2p" placeholderTextColor="#444" onChangeText={v => setGates({...gates, g2: v})} keyboardType="numeric" />
              <TextInput style={styles.gateInput} placeholder="+1p" placeholderTextColor="#444" onChangeText={v => setGates({...gates, g1: v})} keyboardType="numeric" />
            </View>
          </View>
        )}

        <Text style={styles.label}>WYBIERZ LOKALIZACJĘ NA MAPIE:</Text>
        <View style={styles.mapContainer}>
          <MapView style={styles.map} initialRegion={mapRegion} onPress={(e) => setMarkerCoords(e.nativeEvent.coordinate)}>
            {markerCoords && <Marker coordinate={markerCoords} pinColor="#ff4757" />}
          </MapView>
          {markerCoords && <Text style={styles.gpsOk}>✅ Punkt ustawiony</Text>}
        </View>

        <TextInput style={[styles.input, {height: 80, marginTop: 15}]} placeholder="Pełna treść zadania (ukryta do czasu dojazdu)..." placeholderTextColor="#666" multiline value={taskDesc} onChangeText={setTaskDesc} />

        <TouchableOpacity style={styles.submitBtn} onPress={handleCreateTask} disabled={isSubmitting}>
          {isSubmitting ? <ActivityIndicator color="#000" /> : <Text style={styles.submitBtnText}>ZAPISZ MISJĘ</Text>}
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>ISTNIEJĄCE ZADANIA ({tasksList.length})</Text>
      
      {/* POPRAWIONA LISTA ZADAŃ */}
      {tasksList.map(task => (
        <View key={task.id} style={styles.card}>
          <View style={{flex: 1}}>
            <Text style={styles.cardTitle}>{task.tytul}</Text>
            <Text style={styles.cardInfo}>
              {task.typ.toUpperCase()} {task.zestaw_id ? `| Zestaw: ${task.zestaw_id}` : ''}
            </Text>
            <View style={styles.badgeRow}>
              <Text style={styles.badgePoints}>PKT: {task.punkty_bazowe}</Text>
              <Text style={styles.badgePenalty}>KARA: {task.kara_za_odrzucenie || 0}</Text>
            </View>
          </View>
          
          <TouchableOpacity style={styles.deleteBtn} onPress={() => usunZadanie(task.id, task.tytul)}>
            <Text style={styles.deleteBtnText}>Usuń</Text>
          </TouchableOpacity>
        </View>
      ))}
      <View style={{height: 50}} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', padding: 20, paddingBottom: 5 },
  formBox: { backgroundColor: '#111', padding: 20, margin: 15, borderRadius: 20, borderWidth: 1, borderColor: '#222' },
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
  gpsOk: { position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.8)', color: '#2ed573', padding: 5, borderRadius: 5, fontSize: 10, fontWeight: 'bold' },
  submitBtn: { backgroundColor: '#2ed573', padding: 18, borderRadius: 15, alignItems: 'center', marginTop: 25 },
  submitBtnText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
  
  // Nowe style dla listy zadań
  card: { backgroundColor: '#111', padding: 15, marginHorizontal: 20, marginBottom: 10, borderRadius: 12, borderWidth: 1, borderColor: '#222', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  cardInfo: { color: '#888', fontSize: 10, marginTop: 4, marginBottom: 8 },
  badgeRow: { flexDirection: 'row', gap: 10 },
  badgePoints: { backgroundColor: '#0a0a0a', color: '#2ed573', fontSize: 10, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5, borderWidth: 1, borderColor: '#2ed573' },
  badgePenalty: { backgroundColor: '#0a0a0a', color: '#ff4757', fontSize: 10, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5, borderWidth: 1, borderColor: '#ff4757' },
  deleteBtn: { backgroundColor: '#222', padding: 10, borderRadius: 8 },
  deleteBtnText: { color: '#ff4757', fontWeight: 'bold', fontSize: 12 }
});