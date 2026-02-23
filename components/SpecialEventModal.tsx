import React, { useState, useEffect } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Vibration, ActivityIndicator } from 'react-native';
import { supabase } from '@/supabase';
import { Task, Profile } from '@/types';

export default function SpecialEventModal({ userProfile }: { userProfile: Profile }) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // 1. Sprawdzamy, czy w bazie nie wisi jakieś niezrobione zadanie specjalne (nawet jak apka była wyłączona)
    checkActiveSpecialEvent();

    // 2. Nasłuchujemy na nowe na żywo
    const channel = supabase.channel('special_events_global')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks', filter: 'typ=eq.special_event' }, 
        payload => {
          checkActiveSpecialEvent(); // Odśwież stan z bazy, aby weryfikacja była precyzyjna
          Vibration.vibrate([500, 200, 500]);
        }
      ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userProfile.team_id]);

  const checkActiveSpecialEvent = async () => {
    if (!userProfile.team_id) return;
    
    // Szukamy najnowszego zadania specjalnego z bazy
    const { data: specialTasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('typ', 'special_event')
      .order('utworzono_w', { ascending: false })
      .limit(1);

    if (specialTasks && specialTasks.length > 0) {
      const task = specialTasks[0];
      
      // Sprawdzamy, czy ta drużyna już kliknęła to zadanie (w_toku, zaakceptowane itp.)
      const { data: teamTask } = await supabase
        .from('team_tasks')
        .select('id')
        .eq('team_id', userProfile.team_id)
        .eq('task_id', task.id)
        .maybeSingle();

      // Jeśli nie ma rekordu dla tej drużyny - zadanie cały czas czeka na ekranie!
      if (!teamTask) {
        setActiveTask(task);
      }
    }
  };

  const handleClaim = async () => {
    if (!activeTask || !userProfile.team_id) return;
    setIsSubmitting(true);

    const now = new Date().toISOString();

    // Pauzowanie aktywnego zadania głównego
    await supabase.from('team_tasks').update({ ostatnia_pauza_start: now })
      .eq('team_id', userProfile.team_id).eq('status', 'w_toku');

    // Przyjęcie misji specjalnej
    const { error } = await supabase.from('team_tasks').upsert([{
      team_id: userProfile.team_id,
      task_id: activeTask.id,
      status: 'w_toku',
      rozpoczecie_zadania: now
    }]);

    if (!error) {
      setActiveTask(null);
      alert("Zadanie specjalne przyjęte! Czas zadania głównego został wstrzymany.");
    }
    setIsSubmitting(false);
  };

  // Ignorowanie tworzy pusty rekord "pominięte", żeby okienko zniknęło i nie spamowało przy kolejnym uruchomieniu
  const handleIgnore = async () => {
    if (!activeTask || !userProfile.team_id) return;
    await supabase.from('team_tasks').upsert([{
      team_id: userProfile.team_id,
      task_id: activeTask.id,
      status: 'pominiete'
    }]);
    setActiveTask(null);
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
          
          <TouchableOpacity style={styles.closeBtn} onPress={handleIgnore}>
            <Text style={styles.closeText}>IGNORUJ (ZNIKNIE NA ZAWSZE)</Text>
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
  closeText: { color: '#666', fontWeight: 'bold', fontSize: 11 }
});