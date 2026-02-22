import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator, Dimensions } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { supabase } from '@/supabase';
import { Task, TaskType, Team } from '@/types';

const DOSTEPNE_ZESTAWY = Array.from({ length: 11 }, (_, i) => `Zestaw_${i}`);

export default function TasksTab() {
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [miejsceOpis, setMiejsceOpis] = useState('');
  const [zestawId, setZestawId] = useState('Zestaw_1');
  const [taskPoints, setTaskPoints] = useState('10');
  const [taskType, setTaskType] = useState<TaskType>('glowne');
  
  // Lokalizacja GPS (Mapa)
  const [markerCoords, setMarkerCoords] = useState<{latitude: number, longitude: number} | null>(null);
  const [mapRegion, setMapRegion] = useState({
    latitude: 54.4641, // Domyślnie Słupsk
    longitude: 17.0285,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  });

  // Bramki czasu
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
      // Bramki tylko dla zadań głównych
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

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionTitle}>NOWE ZADANIE</Text>
      
      <View style={styles.formBox}>
        <TextInput 
          style={styles.input} 
          placeholder="Tytuł misji..." 
          placeholderTextColor="#666" 
          value={taskTitle} 
          onChangeText={setTaskTitle} 
        />
        
        <TextInput 
          style={[styles.input, {height: 60}]} 
          placeholder="Wskazówka dojazdu (np. Czerwona brama przy rzece)" 
          placeholderTextColor="#666" 
          multiline 
          value={miejsceOpis} 
          onChangeText={setMiejsceOpis} 
        />

        <Text style={styles.label}>TYP ZADANIA:</Text>
        <View style={styles.row}>
          {(['glowne', 'sidequest', 'special_event'] as TaskType[]).map(t => (
            <TouchableOpacity 
              key={t} 
              style={[styles.typeBtn, taskType === t && styles.typeBtnActive]} 
              onPress={() => setTaskType(t)}
            >
              <Text style={styles.typeBtnText}>{t === 'glowne' ? 'GŁÓWNE' : t === 'sidequest' ? 'POBOCZNE' : 'SPECJALNE'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Sekcja widoczna tylko dla zadań głównych */}
        {taskType === 'glowne' && (
          <View style={styles.conditionalSection}>
            <Text style={styles.label}>PRZYPISZ DO ZESTAWU:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.setRow}>
              {DOSTEPNE_ZESTAWY.map(s => (
                <TouchableOpacity 
                  key={s} 
                  style={[styles.setBtn, zestawId === s && styles.setBtnActive]} 
                  onPress={() => setZestawId(s)}
                >
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
          <MapView 
            style={styles.map} 
            initialRegion={mapRegion}
            onPress={(e) => setMarkerCoords(e.nativeEvent.coordinate)}
          >
            {markerCoords && <Marker coordinate={markerCoords} pinColor="#ff4757" />}
          </MapView>
          {markerCoords && <Text style={styles.gpsOk}>✅ Punkt ustawiony</Text>}
        </View>

        <TextInput 
          style={[styles.input, {height: 80, marginTop: 15}]} 
          placeholder="Pełna treść zadania (ukryta do czasu dojazdu)..." 
          placeholderTextColor="#666" 
          multiline 
          value={taskDesc} 
          onChangeText={setTaskDesc} 
        />

        <TouchableOpacity style={styles.submitBtn} onPress={handleCreateTask} disabled={isSubmitting}>
          {isSubmitting ? <ActivityIndicator color="#000" /> : <Text style={styles.submitBtnText}>ZAPISZ MISJĘ</Text>}
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>ISTNIEJĄCE ZADANIA ({tasksList.length})</Text>
      {tasksList.map(task => (
        <View key={task.id} style={styles.card}>
          <Text style={styles.cardTitle}>{task.tytul}</Text>
          <Text style={styles.cardInfo}>{task.typ.toUpperCase()} {task.zestaw_id ? `| ${task.zestaw_id}` : ''}</Text>
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

  card: { backgroundColor: '#111', padding: 15, marginHorizontal: 20, marginBottom: 10, borderRadius: 12, borderWidth: 1, borderColor: '#222' },
  cardTitle: { color: '#fff', fontWeight: 'bold' },
  cardInfo: { color: '#444', fontSize: 10, marginTop: 4 }
});