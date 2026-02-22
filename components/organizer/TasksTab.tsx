import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ScrollView,
  TextInput, Alert, ActivityIndicator, Modal
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { supabase } from '@/supabase';
import { Task, TaskType } from '@/types';

const DOSTEPNE_ZESTAWY = Array.from({ length: 12 }, (_, i) => `Zestaw_${i}`);

const EMPTY_FORM = {
  tytul: '', opis: '', miejsceOpis: '', zestawId: 'Zestaw_1',
  points: '10', type: 'glowne' as TaskType,
  gates: { g5: '', g4: '', g3: '', g2: '', g1: '' },
  kolejnosc: '0',
};

export default function TasksTab() {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [markerCoords, setMarkerCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [tasksList, setTasksList] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filterZestaw, setFilterZestaw] = useState<string | null>(null);

  useEffect(() => { fetchTasks(); }, []);

  const fetchTasks = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .order('zestaw_id', { ascending: true })
      .order('kolejnosc', { ascending: true });
    if (data) setTasksList(data as Task[]);
    setLoading(false);
  };

  const resetForm = () => {
    setForm({ ...EMPTY_FORM });
    setMarkerCoords(null);
    setEditingId(null);
    setShowForm(false);
  };

  const openEdit = (task: Task) => {
    setForm({
      tytul: task.tytul,
      opis: task.opis || '',
      miejsceOpis: task.miejsce_opis || '',
      zestawId: task.zestaw_id || 'Zestaw_1',
      points: String(task.punkty_bazowe),
      type: task.typ,
      gates: {
        g5: String(task.gate_5_min || ''),
        g4: String(task.gate_4_min || ''),
        g3: String(task.gate_3_min || ''),
        g2: String(task.gate_2_min || ''),
        g1: String(task.gate_1_min || ''),
      },
      kolejnosc: String(task.kolejnosc || 0),
    });
    setMarkerCoords(task.latitude ? { latitude: task.latitude, longitude: task.longitude! } : null);
    setEditingId(task.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.tytul.trim()) return Alert.alert('Błąd', 'Podaj tytuł zadania!');
    if (!markerCoords) return Alert.alert('Błąd', 'Wybierz lokalizację na mapie!');

    setSubmitting(true);
    const payload: any = {
      tytul: form.tytul.trim(),
      opis: form.opis.trim(),
      miejsce_opis: form.miejsceOpis.trim(),
      zestaw_id: form.type === 'glowne' ? form.zestawId : null,
      typ: form.type,
      latitude: markerCoords.latitude,
      longitude: markerCoords.longitude,
      punkty_bazowe: parseInt(form.points) || 0,
      kolejnosc: parseInt(form.kolejnosc) || 0,
      gate_5_min: form.type === 'glowne' ? parseInt(form.gates.g5) || null : null,
      gate_4_min: form.type === 'glowne' ? parseInt(form.gates.g4) || null : null,
      gate_3_min: form.type === 'glowne' ? parseInt(form.gates.g3) || null : null,
      gate_2_min: form.type === 'glowne' ? parseInt(form.gates.g2) || null : null,
      gate_1_min: form.type === 'glowne' ? parseInt(form.gates.g1) || null : null,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from('tasks').update(payload).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('tasks').insert([payload]));
    }

    setSubmitting(false);
    if (error) {
      Alert.alert('Błąd', error.message);
    } else {
      Alert.alert('Sukces', editingId ? 'Zadanie zaktualizowane!' : 'Zadanie dodane!');
      resetForm();
      fetchTasks();
    }
  };

  const handleDelete = (id: string, tytul: string) => {
    Alert.alert('Usuń zadanie', `Usunąć "${tytul}"?`, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'USUŃ', style: 'destructive', onPress: async () => {
          await supabase.from('tasks').delete().eq('id', id);
          fetchTasks();
        },
      },
    ]);
  };

  // Unikalne zestawy z listy zadań
  const zestawy = Array.from(new Set(tasksList.map((t) => t.zestaw_id).filter(Boolean))) as string[];
  const filteredTasks = filterZestaw
    ? tasksList.filter((t) => t.zestaw_id === filterZestaw)
    : tasksList;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <ScrollView style={styles.container}>
        {/* ── HEADER ── */}
        <View style={styles.topRow}>
          <Text style={styles.header}>ZADANIA ({tasksList.length})</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => { resetForm(); setShowForm(true); }}>
            <Text style={styles.addBtnText}>+ NOWE</Text>
          </TouchableOpacity>
        </View>

        {/* ── FILTR ZESTAWÓW ── */}
        {zestawy.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
            <TouchableOpacity
              style={[styles.filterBtn, !filterZestaw && styles.filterBtnActive]}
              onPress={() => setFilterZestaw(null)}
            >
              <Text style={styles.filterBtnText}>WSZYSTKIE</Text>
            </TouchableOpacity>
            {zestawy.sort().map((z) => (
              <TouchableOpacity
                key={z}
                style={[styles.filterBtn, filterZestaw === z && styles.filterBtnActive]}
                onPress={() => setFilterZestaw(z)}
              >
                <Text style={styles.filterBtnText}>{z}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* ── LISTA ZADAŃ ── */}
        {loading ? (
          <ActivityIndicator color="#ff4757" style={{ marginTop: 30 }} />
        ) : (
          filteredTasks.map((task) => (
            <View key={task.id} style={styles.card}>
              <View style={{ flex: 1 }}>
                <View style={styles.cardTop}>
                  <View style={[styles.typeDot, { backgroundColor: task.typ === 'glowne' ? '#3742fa' : task.typ === 'sidequest' ? '#2ed573' : '#ffa502' }]} />
                  <Text style={styles.cardTitle}>{task.tytul}</Text>
                </View>
                <Text style={styles.cardMeta}>
                  {task.typ.toUpperCase()}
                  {task.zestaw_id ? ` | ${task.zestaw_id}` : ''}
                  {task.kolejnosc !== undefined ? ` | #${task.kolejnosc}` : ''}
                  {` | ${task.punkty_bazowe} pkt`}
                </Text>
                {task.opis ? <Text style={styles.cardDesc} numberOfLines={2}>{task.opis}</Text> : null}
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(task)}>
                  <Text style={styles.editBtnText}>✏️</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.delBtn} onPress={() => handleDelete(task.id, task.tytul)}>
                  <Text style={styles.delBtnText}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── MODAL FORMULARZA ── */}
      <Modal visible={showForm} animationType="slide">
        <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalTitle}>{editingId ? '✏️ EDYTUJ ZADANIE' : '➕ NOWE ZADANIE'}</Text>

          <TextInput style={styles.input} placeholder="Tytuł misji *" placeholderTextColor="#555"
            value={form.tytul} onChangeText={(v) => setForm({ ...form, tytul: v })} />

          <TextInput style={[styles.input, { height: 60 }]}
            placeholder="Wskazówka dojazdu (widoczna od razu)" placeholderTextColor="#555"
            multiline value={form.miejsceOpis} onChangeText={(v) => setForm({ ...form, miejsceOpis: v })} />

          <TextInput style={[styles.input, { height: 80 }]}
            placeholder="Treść zadania (ukryta do startu)" placeholderTextColor="#555"
            multiline value={form.opis} onChangeText={(v) => setForm({ ...form, opis: v })} />

          {/* TYP */}
          <Text style={styles.label}>TYP ZADANIA:</Text>
          <View style={styles.row}>
            {(['glowne', 'sidequest', 'special_event'] as TaskType[]).map((t) => (
              <TouchableOpacity
                key={t} style={[styles.typeBtn, form.type === t && styles.typeBtnActive]}
                onPress={() => setForm({ ...form, type: t })}
              >
                <Text style={styles.typeBtnText}>
                  {t === 'glowne' ? 'GŁÓWNE' : t === 'sidequest' ? 'POBOCZNE' : 'SPECJALNE'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* PUNKTY + KOLEJNOŚĆ */}
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>PUNKTY:</Text>
              <TextInput style={styles.input} keyboardType="numeric"
                value={form.points} onChangeText={(v) => setForm({ ...form, points: v })} />
            </View>
            {form.type === 'glowne' && (
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.label}>KOLEJNOŚĆ:</Text>
                <TextInput style={styles.input} keyboardType="numeric"
                  value={form.kolejnosc} onChangeText={(v) => setForm({ ...form, kolejnosc: v })} />
              </View>
            )}
          </View>

          {/* ZESTAW I BRAMKI - tylko dla zadań głównych */}
          {form.type === 'glowne' && (
            <View style={styles.section}>
              <Text style={styles.label}>ZESTAW:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                {DOSTEPNE_ZESTAWY.map((s) => (
                  <TouchableOpacity key={s}
                    style={[styles.setBtn, form.zestawId === s && styles.setBtnActive]}
                    onPress={() => setForm({ ...form, zestawId: s })}
                  >
                    <Text style={styles.setBtnText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.label}>BRAMKI CZASU (max minuty):</Text>
              <View style={styles.row}>
                {(['g5', 'g4', 'g3', 'g2', 'g1'] as const).map((k, i) => (
                  <TextInput key={k} style={styles.gateInput}
                    placeholder={`+${5 - i}p`} placeholderTextColor="#444"
                    keyboardType="numeric"
                    value={form.gates[k]}
                    onChangeText={(v) => setForm({ ...form, gates: { ...form.gates, [k]: v } })}
                  />
                ))}
              </View>
            </View>
          )}

          {/* MAPA */}
          <Text style={styles.label}>LOKALIZACJA (dotknij, aby ustawić pin):</Text>
          <View style={styles.mapBox}>
            <MapView
              style={{ flex: 1 }}
              initialRegion={{ latitude: 54.4641, longitude: 17.0285, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
              onPress={(e) => setMarkerCoords(e.nativeEvent.coordinate)}
            >
              {markerCoords && <Marker coordinate={markerCoords} pinColor="#ff4757" />}
            </MapView>
          </View>
          {markerCoords ? (
            <Text style={styles.coordOk}>✅ {markerCoords.latitude.toFixed(5)}, {markerCoords.longitude.toFixed(5)}</Text>
          ) : (
            <Text style={styles.coordMissing}>⚠️ Brak lokalizacji</Text>
          )}

          {/* PRZYCISKI */}
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>💾 ZAPISZ</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={resetForm}>
            <Text style={styles.cancelBtnText}>ANULUJ</Text>
          </TouchableOpacity>
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', padding: 15 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  header: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  addBtn: { backgroundColor: '#ff4757', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 },
  addBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },

  filterRow: { flexDirection: 'row', marginBottom: 15 },
  filterBtn: { backgroundColor: '#111', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, marginRight: 8, borderWidth: 1, borderColor: '#222' },
  filterBtnActive: { borderColor: '#ff4757', backgroundColor: '#1a0000' },
  filterBtnText: { color: '#aaa', fontSize: 11, fontWeight: 'bold' },

  card: { backgroundColor: '#111', padding: 15, borderRadius: 15, marginBottom: 10, flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderColor: '#1a1a1a' },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8 },
  typeDot: { width: 8, height: 8, borderRadius: 4 },
  cardTitle: { color: '#fff', fontWeight: 'bold', fontSize: 14, flex: 1 },
  cardMeta: { color: '#444', fontSize: 9, fontWeight: 'bold', letterSpacing: 1 },
  cardDesc: { color: '#555', fontSize: 11, marginTop: 4 },
  cardActions: { flexDirection: 'column', gap: 6, marginLeft: 10 },
  editBtn: { backgroundColor: '#1a1a1a', padding: 8, borderRadius: 8, alignItems: 'center' },
  editBtnText: { fontSize: 14 },
  delBtn: { backgroundColor: '#1a0000', padding: 8, borderRadius: 8, alignItems: 'center' },
  delBtnText: { fontSize: 14 },

  // Modal
  modal: { flex: 1, backgroundColor: '#000' },
  modalContent: { padding: 20, paddingBottom: 60 },
  modalTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  label: { color: '#555', fontSize: 9, fontWeight: 'bold', letterSpacing: 1, marginBottom: 6, marginTop: 15 },
  input: { backgroundColor: '#111', color: '#fff', padding: 13, borderRadius: 12, borderWidth: 1, borderColor: '#222', marginBottom: 5 },

  row: { flexDirection: 'row', gap: 8, marginBottom: 5 },
  typeBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#1a1a1a', alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  typeBtnActive: { backgroundColor: '#ff4757', borderColor: '#ff4757' },
  typeBtnText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },

  section: { borderTopWidth: 1, borderTopColor: '#1a1a1a', marginTop: 10, paddingTop: 5 },
  setBtn: { backgroundColor: '#111', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginRight: 8, borderWidth: 1, borderColor: '#222' },
  setBtnActive: { backgroundColor: '#3742fa', borderColor: '#3742fa' },
  setBtnText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  gateInput: { flex: 1, backgroundColor: '#111', color: '#fff', padding: 10, borderRadius: 8, textAlign: 'center', fontSize: 12, borderWidth: 1, borderColor: '#222' },

  mapBox: { height: 220, borderRadius: 15, overflow: 'hidden', borderWidth: 1, borderColor: '#333' },
  coordOk: { color: '#2ed573', fontSize: 10, marginTop: 6, fontWeight: 'bold' },
  coordMissing: { color: '#ff4757', fontSize: 10, marginTop: 6 },

  saveBtn: { backgroundColor: '#2ed573', padding: 18, borderRadius: 15, alignItems: 'center', marginTop: 25 },
  saveBtnText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
  cancelBtn: { marginTop: 15, alignItems: 'center' },
  cancelBtnText: { color: '#444', fontSize: 13 },
});
