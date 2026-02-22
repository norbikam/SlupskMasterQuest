import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Image, Modal, TextInput, Linking
} from 'react-native';
import { supabase } from '@/supabase';

export default function JudgingTab() {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [judgeNotes, setJudgeNotes] = useState('');
  const [manualPoints, setManualPoints] = useState('');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchSubmissions();

    // Realtime – odświeżaj listę gdy nowe zgłoszenia
    const channel = supabase
      .channel('judging_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_tasks' }, () =>
        fetchSubmissions()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchSubmissions = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('team_tasks')
      .select('*, teams(nazwa), tasks(*)')
      .eq('status', 'do_oceny')
      .order('przeslano_zadanie', { ascending: true });
    if (data) setSubmissions(data);
    setLoading(false);
  };

  // Czas netto w ms
  const calcNetMs = (item: any): number => {
    if (!item.rozpoczecie_zadania || !item.przeslano_zadanie) return 0;
    const start = new Date(item.rozpoczecie_zadania).getTime();
    const end = new Date(item.przeslano_zadanie).getTime();
    const pauseMs = item.suma_pauzy_ms || 0;
    return Math.max(0, end - start - pauseMs);
  };

  const fmtMs = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}m ${String(s).padStart(2, '0')}s`;
  };

  const getTimeBonusPts = (netMs: number, task: any): number => {
    const netMin = netMs / 1000 / 60;
    if (task.gate_5_min && netMin <= task.gate_5_min) return 5;
    if (task.gate_4_min && netMin <= task.gate_4_min) return 4;
    if (task.gate_3_min && netMin <= task.gate_3_min) return 3;
    if (task.gate_2_min && netMin <= task.gate_2_min) return 2;
    if (task.gate_1_min && netMin <= task.gate_1_min) return 1;
    return 0;
  };

  const openVerdict = (item: any) => {
    const netMs = calcNetMs(item);
    const bonus = getTimeBonusPts(netMs, item.tasks);
    setSelectedItem(item);
    setJudgeNotes('');
    setManualPoints(String(item.tasks.punkty_bazowe + bonus));
    setModalVisible(true);
  };

  const handleVerdict = async (approved: boolean) => {
    if (!selectedItem) return;
    setProcessing(true);

    if (approved) {
      const pts = parseInt(manualPoints) || 0;

      await supabase
        .from('team_tasks')
        .update({
          status: 'zaakceptowane',
          przyznane_punkty: pts,
          uwagi_sedziego: judgeNotes.trim() || null,
        })
        .eq('id', selectedItem.id);

      // Dodaj punkty drużynie przez RPC
      const { error: rpcErr } = await supabase.rpc('increment_team_points', {
        team_id: selectedItem.team_id,
        amount: pts,
      });

      if (rpcErr) {
        // Fallback ręczny update
        await supabase
          .from('teams')
          .update({ punkty: selectedItem.teams.punkty + pts })
          .eq('id', selectedItem.team_id);
      }

      // Jeśli to Special Event – odpauzuj zadanie główne drużyny
      if (selectedItem.tasks.typ === 'special_event') {
        const { data: mainTask } = await supabase
          .from('team_tasks')
          .select('*')
          .eq('team_id', selectedItem.team_id)
          .eq('status', 'w_toku')
          .not('ostatnia_pauza_start', 'is', null)
          .maybeSingle();

        if (mainTask) {
          const pauseStart = new Date(mainTask.ostatnia_pauza_start).getTime();
          const pauseEnd = Date.now();
          await supabase
            .from('team_tasks')
            .update({
              suma_pauzy_ms: (mainTask.suma_pauzy_ms || 0) + (pauseEnd - pauseStart),
              ostatnia_pauza_start: null,
            })
            .eq('id', mainTask.id);
        }
      }

      Alert.alert('✅ Zaakceptowano', `+${pts} pkt dla drużyny ${selectedItem.teams.nazwa}`);
    } else {
      // Odrzucenie – wróć do statusu 'w_toku' z uwagami
      await supabase
        .from('team_tasks')
        .update({
          status: 'odrzucone',
          uwagi_sedziego: judgeNotes.trim() || 'Dowód niewystarczający.',
        })
        .eq('id', selectedItem.id);

      Alert.alert('❌ Odrzucono', 'Drużyna może poprawić i wysłać ponownie.');
    }

    setProcessing(false);
    setModalVisible(false);
    fetchSubmissions();
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────
  if (loading && submissions.length === 0) {
    return <ActivityIndicator color="#ff4757" style={{ marginTop: 60 }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <ScrollView style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>OCENA ZADAŃ ⚖️</Text>
          <TouchableOpacity onPress={fetchSubmissions} style={styles.refreshBtn}>
            <Text style={styles.refreshText}>↻ Odśwież</Text>
          </TouchableOpacity>
        </View>

        {loading && <ActivityIndicator color="#ff4757" style={{ marginBottom: 10 }} />}

        {submissions.length === 0 && !loading && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={styles.emptyText}>Brak zgłoszeń do oceny</Text>
          </View>
        )}

        {submissions.map((item) => {
          const netMs = calcNetMs(item);
          const bonus = getTimeBonusPts(netMs, item.tasks);
          const totalPts = item.tasks.punkty_bazowe + bonus;
          const isVideo =
            item.dowod_url?.includes('.mp4') || item.dowod_url?.includes('.mov');

          return (
            <View key={item.id} style={styles.card}>
              {/* NAGŁÓWEK */}
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.teamName}>{item.teams?.nazwa}</Text>
                  <Text style={styles.taskName}>{item.tasks?.tytul}</Text>
                  <Text style={styles.typeBadge}>{item.tasks?.typ?.toUpperCase()}</Text>
                </View>
                <View style={styles.ptsBox}>
                  <Text style={styles.ptsValue}>{totalPts}</Text>
                  <Text style={styles.ptsLabel}>PKT</Text>
                </View>
              </View>

              {/* INFO CZASOWE */}
              <View style={styles.infoRow}>
                <View style={styles.infoCell}>
                  <Text style={styles.infoLabel}>CZAS NETTO</Text>
                  <Text style={styles.infoVal}>{fmtMs(netMs)}</Text>
                </View>
                <View style={styles.infoCell}>
                  <Text style={styles.infoLabel}>BONUS</Text>
                  <Text style={[styles.infoVal, { color: '#2ed573' }]}>+{bonus} PKT</Text>
                </View>
                <View style={styles.infoCell}>
                  <Text style={styles.infoLabel}>BAZOWE</Text>
                  <Text style={styles.infoVal}>{item.tasks?.punkty_bazowe} PKT</Text>
                </View>
              </View>

              {/* ODPOWIEDŹ TEKSTOWA */}
              {item.odpowiedz_tekst ? (
                <View style={styles.answerBox}>
                  <Text style={styles.answerLabel}>ODPOWIEDŹ:</Text>
                  <Text style={styles.answerText}>{item.odpowiedz_tekst}</Text>
                </View>
              ) : null}

              {/* DOWÓD */}
              {item.dowod_url ? (
                <View style={styles.proofBox}>
                  {isVideo ? (
                    <TouchableOpacity
                      style={styles.videoBtn}
                      onPress={() => Linking.openURL(item.dowod_url)}
                    >
                      <Text style={styles.videoBtnText}>▶ OTWÓRZ WIDEO W PRZEGLĄDARCE</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity onPress={() => Linking.openURL(item.dowod_url)}>
                      <Image
                        source={{ uri: item.dowod_url }}
                        style={styles.proofImg}
                        resizeMode="cover"
                      />
                      <Text style={styles.proofHint}>Dotknij, aby otworzyć pełny rozmiar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <Text style={styles.noProof}>⚠️ Brak dowodu (tylko opis tekstowy)</Text>
              )}

              {/* PRZYCISK OCENY */}
              <TouchableOpacity style={styles.judgeBtn} onPress={() => openVerdict(item)}>
                <Text style={styles.judgeBtnText}>⚖️ WYDAJ WERDYKT</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ─── MODAL WERDYKTU ──────────────────────────────── */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>WERDYKT</Text>
            {selectedItem && (
              <>
                <Text style={styles.modalTeam}>{selectedItem.teams?.nazwa}</Text>
                <Text style={styles.modalTask}>{selectedItem.tasks?.tytul}</Text>

                {/* Czas i bramki */}
                {(() => {
                  const netMs = calcNetMs(selectedItem);
                  const bonus = getTimeBonusPts(netMs, selectedItem.tasks);
                  return (
                    <View style={styles.modalInfoBox}>
                      <Text style={styles.modalInfoText}>
                        Czas netto: <Text style={{ color: '#fff' }}>{fmtMs(netMs)}</Text>
                      </Text>
                      <Text style={styles.modalInfoText}>
                        Bonus czasowy: <Text style={{ color: '#2ed573' }}>+{bonus} PKT</Text>
                      </Text>
                    </View>
                  );
                })()}

                <Text style={styles.modalLabel}>PRZYZNANE PUNKTY (edytuj jeśli chcesz):</Text>
                <TextInput
                  style={styles.modalInput}
                  value={manualPoints}
                  onChangeText={setManualPoints}
                  keyboardType="numeric"
                />

                <Text style={styles.modalLabel}>UWAGI SĘDZIEGO (opcjonalnie):</Text>
                <TextInput
                  style={[styles.modalInput, { height: 80, textAlignVertical: 'top' }]}
                  value={judgeNotes}
                  onChangeText={setJudgeNotes}
                  placeholder="np. Dobra robota! / Popraw bo..."
                  placeholderTextColor="#444"
                  multiline
                />

                <View style={styles.modalBtns}>
                  <TouchableOpacity
                    style={styles.rejectBtn}
                    onPress={() => handleVerdict(false)}
                    disabled={processing}
                  >
                    <Text style={styles.rejectBtnText}>❌ ODRZUĆ</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.acceptBtn}
                    onPress={() => handleVerdict(true)}
                    disabled={processing}
                  >
                    {processing ? (
                      <ActivityIndicator color="#000" />
                    ) : (
                      <Text style={styles.acceptBtnText}>✅ ZATWIERDŹ</Text>
                    )}
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.cancelBtnText}>ANULUJ</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  refreshBtn: { backgroundColor: '#222', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  refreshText: { color: '#aaa', fontSize: 12, fontWeight: 'bold' },

  emptyBox: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 50, marginBottom: 10 },
  emptyText: { color: '#444', fontWeight: 'bold' },

  card: {
    backgroundColor: '#111', padding: 20, borderRadius: 20, marginBottom: 20,
    borderWidth: 1, borderColor: '#222',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  teamName: { color: '#ff4757', fontWeight: 'bold', fontSize: 13 },
  taskName: { color: '#fff', fontSize: 17, fontWeight: 'bold', marginTop: 3, maxWidth: 220 },
  typeBadge: { color: '#555', fontSize: 9, fontWeight: 'bold', marginTop: 4, letterSpacing: 1 },
  ptsBox: { alignItems: 'center', backgroundColor: '#0a0a0a', padding: 10, borderRadius: 12, minWidth: 60 },
  ptsValue: { color: '#ffa502', fontSize: 22, fontWeight: 'bold' },
  ptsLabel: { color: '#444', fontSize: 9, fontWeight: 'bold' },

  infoRow: { flexDirection: 'row', gap: 10, marginBottom: 15 },
  infoCell: { flex: 1, backgroundColor: '#0a0a0a', padding: 10, borderRadius: 10, alignItems: 'center' },
  infoLabel: { color: '#444', fontSize: 8, fontWeight: 'bold', letterSpacing: 1 },
  infoVal: { color: '#fff', fontWeight: 'bold', marginTop: 2 },

  answerBox: { backgroundColor: '#0a0a0a', padding: 12, borderRadius: 10, marginBottom: 15, borderLeftWidth: 3, borderLeftColor: '#3742fa' },
  answerLabel: { color: '#3742fa', fontSize: 9, fontWeight: 'bold', marginBottom: 4 },
  answerText: { color: '#ccc', lineHeight: 18 },

  proofBox: { marginBottom: 15 },
  proofImg: { width: '100%', height: 200, borderRadius: 12, backgroundColor: '#1a1a1a' },
  proofHint: { color: '#444', fontSize: 9, textAlign: 'center', marginTop: 4 },
  videoBtn: { backgroundColor: '#1a1a2a', padding: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#3742fa' },
  videoBtnText: { color: '#3742fa', fontWeight: 'bold' },
  noProof: { color: '#555', fontSize: 11, marginBottom: 15, fontStyle: 'italic' },

  judgeBtn: { backgroundColor: '#222', padding: 15, borderRadius: 12, alignItems: 'center' },
  judgeBtnText: { color: '#ffa502', fontWeight: 'bold', fontSize: 13 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.97)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#111', padding: 25, borderRadius: 25, borderWidth: 1, borderColor: '#333' },
  modalTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 15 },
  modalTeam: { color: '#ff4757', fontWeight: 'bold', textAlign: 'center', fontSize: 13 },
  modalTask: { color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'center', marginBottom: 15 },
  modalInfoBox: { backgroundColor: '#0a0a0a', padding: 15, borderRadius: 12, marginBottom: 20 },
  modalInfoText: { color: '#666', marginBottom: 5 },
  modalLabel: { color: '#444', fontSize: 10, fontWeight: 'bold', marginBottom: 8, marginTop: 15 },
  modalInput: {
    backgroundColor: '#000', color: '#fff', padding: 15, borderRadius: 12,
    borderWidth: 1, borderColor: '#222', fontSize: 16,
  },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 25 },
  rejectBtn: { flex: 1, backgroundColor: '#1a0000', padding: 18, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#ff4757' },
  rejectBtnText: { color: '#ff4757', fontWeight: 'bold' },
  acceptBtn: { flex: 2, backgroundColor: '#2ed573', padding: 18, borderRadius: 12, alignItems: 'center' },
  acceptBtnText: { color: '#000', fontWeight: 'bold', fontSize: 15 },
  cancelBtn: { marginTop: 20, alignItems: 'center' },
  cancelBtnText: { color: '#444', fontSize: 12 },
});
