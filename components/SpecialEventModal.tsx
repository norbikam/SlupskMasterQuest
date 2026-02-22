import React, { useState, useEffect } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Vibration, ActivityIndicator } from 'react-native';
import { supabase } from '@/supabase';
import { Task, Profile } from '@/types';

export default function SpecialEventModal({ userProfile }: { userProfile: Profile }) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const channel = supabase.channel('special_events_global')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks', filter: 'typ=eq.special_event' }, 
        payload => {
          setActiveTask(payload.new as Task);
          Vibration.vibrate([500, 200, 500]);
        }
      ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleClaim = async () => {
    if (!activeTask || !userProfile.team_id) return;
    setIsSubmitting(true);

    const now = new Date().toISOString();

    // 1. Logika Pauzy: Znajdź aktywne zadanie główne i zapisz start pauzy
    await supabase
      .from('team_tasks')
      .update({ ostatnia_pauza_start: now })
      .eq('team_id', userProfile.team_id)
      .eq('status', 'w_toku'); // Pauzujemy tylko to, co jest aktualnie robione

    // 2. Przejmij zadanie specjalne (standardowa logika)
    const { error } = await supabase
      .from('team_tasks')
      .upsert([{
        team_id: userProfile.team_id,
        task_id: activeTask.id,
        status: 'w_toku',
        rozpoczecie_zadania: now // Zadanie specjalne ma swój własny czas
      }]);

    if (!error) {
      setActiveTask(null);
      alert("Zadanie specjalne przyjęte! Czas zadania głównego został wstrzymany.");
    }
    setIsSubmitting(false);
  };

  if (!activeTask) return null;

  return (
    <Modal transparent visible={!!activeTask} animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.badge}>SPECIAL EVENT ⚡</Text>
          <Text style={styles.title}>{activeTask.tytul}</Text>
          <Text style={styles.info}>Przyjęcie tego zadania PAUZUJE timer zadania głównego!</Text>
          
          <TouchableOpacity style={styles.acceptBtn} onPress={handleClaim} disabled={isSubmitting}>
            {isSubmitting ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>PRZYJMIJ I ZAPAUZUJ</Text>}
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.closeBtn} onPress={() => setActiveTask(null)}>
            <Text style={styles.closeText}>IGNORUJ</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', padding: 20 },
  modal: { backgroundColor: '#111', padding: 30, borderRadius: 25, borderWidth:2 ,borderColor: '#ffa502', alignItems: 'center' },
  badge: { backgroundColor: '#ffa502', color: '#000', padding: 5, borderRadius: 5, fontWeight: 'bold', fontSize: 10, marginBottom: 15 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 10 },
  info: { color: '#888', textAlign: 'center', marginBottom: 25 },
  acceptBtn: { backgroundColor: '#2ed573', width: '100%', padding: 20, borderRadius: 15, alignItems: 'center' },
  btnText: { fontWeight: 'bold', fontSize: 16 },
  closeBtn: { marginTop: 20 },
  closeText: { color: '#555', fontWeight: 'bold' }
});