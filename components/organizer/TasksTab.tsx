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
  const [kolejnosc, setKolejnosc] = useState('1');
  const [taskType, setTaskType] = useState<TaskType>('glowne');
  const [markerCoords, setMarkerCoords] = useState<{latitude: number, longitude: number} | null>(null);
  const [gates, setGates] = useState({ g5: '', g4: '', g3: '', g2: '', g1: '' });
  const [tasksList, setTasksList] = useState<Task[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => { fetchTasks(); }, []);

  const fetchTasks = async () => {
    const { data } = await supabase.from('tasks').select('*').order('kolejnosc', { ascending: true });
    if (data) setTasksList(data);
  };

  const handleCreateTask = async () => {
    if (!taskTitle || !markerCoords) return Alert.alert('Błąd', 'Podaj tytuł i zaznacz miejsce na mapie!');
    setIsSubmitting(true);
    const { error } = await supabase.from('tasks').insert([{
      tytul: taskTitle, 
      opis: taskDesc, 
      miejsce_opis: miejsceOpis,
      typ: taskType, 
      zestaw_id: taskType === 'glowne' ? zestawId : null,
      kolejnosc: parseInt(kolejnosc) || 0,
      latitude: markerCoords.latitude, 
      longitude: markerCoords.longitude,
      gate_5_min: taskType === 'glowne' ? parseInt(gates.g5) : null,
      gate_4_min: taskType === 'glowne' ? parseInt(gates.g4) : null,
      gate_3_min: taskType === 'glowne' ? parseInt(gates.g3) : null,
      gate_2_min: taskType === 'glowne' ? parseInt(gates.g2) : null,
      gate_1_min: taskType === 'glowne' ? parseInt(gates.g1) : null,
    }]);
    if (!error) { 
      Alert.alert('Sukces', 'Zadanie dodane'); 
      setTaskTitle(''); setTaskDesc(''); setMiejsceOpis('');
      fetchTasks(); 
    } else {
      Alert.alert('Błąd', error.message);
    }
    setIsSubmitting(false);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.form}>
        <TextInput style={styles.input} placeholder="Tytuł zadania" value={taskTitle} onChangeText={setTaskTitle} placeholderTextColor="#666" />
        <TextInput style={styles.input} placeholder="Wskazówka dojazdu (miejsce)" value={miejsceOpis} onChangeText={setMiejsceOpis} placeholderTextColor="#666" />
        
        <Text style={styles.label}>TYP ZADANIA:</Text>
        <View style={styles.row}>
           {['glowne', 'sidequest', 'special_event'].map((t) => (
             <TouchableOpacity key={t} style={[styles.typeBtn, taskType === t && styles.active]} onPress={() => setTaskType(t as any)}>
               <Text style={styles.btnText}>{t === 'glowne' ? 'GŁÓWNE' : t === 'sidequest' ? 'POBOCZNE' : 'SPECJALNE'}</Text>
             </TouchableOpacity>
           ))}
        </View>

        {taskType === 'glowne' && (
          <View style={styles.subForm}>
            <Text style={styles.label}>ZESTAW:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 10}}>
              {DOSTEPNE_ZESTAWY.map(s => (
                <TouchableOpacity key={s} style={[styles.setBtn, zestawId === s && styles.active]} onPress={() => setZestawId(s)}>
                  <Text style={styles.btnText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.label}>KOLEJNOŚĆ W ZESTAWIE:</Text>
            <TextInput style={styles.input} placeholder="1, 2, 3..." value={kolejnosc} onChangeText={setKolejnosc} keyboardType="numeric" />
            
            <Text style={styles.label}>BRAMKI BONUSOWE (MINUTY):</Text>
            <View style={styles.row}>
              {['g5','g4','g3','g2','g1'].map(g => (
                <TextInput key={g} style={styles.gateInput} placeholder={g.replace('g','+')} onChangeText={v => setGates({...gates, [g]: v})} keyboardType="numeric" />
              ))}
            </View>
          </View>
        )}

        <Text style={styles.label}>LOKALIZACJA (KLIKNIJ NA MAPIE):</Text>
        <View style={styles.mapWrap}>
          <MapView style={styles.map} initialRegion={{latitude: 54.46, longitude: 17.03, latitudeDelta: 0.05, longitudeDelta: 0.05}} onPress={e => setMarkerCoords(e.nativeEvent.coordinate)}>
            {markerCoords && <Marker coordinate={markerCoords} pinColor="#ff4757" />}
          </MapView>
        </View>

        <TextInput style={[styles.input, {height: 80}]} placeholder="Pełna treść zadania (ukryta)..." multiline value={taskDesc} onChangeText={setTaskDesc} placeholderTextColor="#666" />

        <TouchableOpacity style={styles.saveBtn} onPress={handleCreateTask} disabled={isSubmitting}>
          {isSubmitting ? <ActivityIndicator color="#000" /> : <Text style={styles.saveText}>ZAPISZ MISJĘ</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  form: { padding: 20, backgroundColor: '#111', margin: 10, borderRadius: 20, borderWidth: 1, borderColor: '#222' },
  input: { backgroundColor: '#000', color: '#fff', padding: 12, borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#333' },
  label: { color: '#444', fontSize: 10, fontWeight: 'bold', marginBottom: 5, letterSpacing: 1 },
  row: { flexDirection: 'row', gap: 5, marginBottom: 10 },
  typeBtn: { flex: 1, padding: 12, backgroundColor: '#222', borderRadius: 8, alignItems: 'center' },
  setBtn: { padding: 10, backgroundColor: '#222', marginRight: 5, borderRadius: 5 },
  active: { backgroundColor: '#ff4757' },
  btnText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  gateInput: { flex: 1, backgroundColor: '#000', color: '#fff', textAlign: 'center', padding: 8, borderRadius: 5, borderWidth: 1, borderColor: '#333' },
  mapWrap: { height: 200, borderRadius: 15, overflow: 'hidden', marginVertical: 10, borderWidth: 1, borderColor: '#333' },
  map: { flex: 1 },
  saveBtn: { backgroundColor: '#2ed573', padding: 18, borderRadius: 15, alignItems: 'center', marginTop: 10 },
  saveText: { fontWeight: 'bold', color: '#000', fontSize: 16 },
  subForm: { borderTopWidth: 1, borderTopColor: '#222', paddingTop: 10, marginTop: 5 }
});