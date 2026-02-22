import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '@/supabase';
import { Task, TaskType, Team } from '@/types';

export default function TasksTab() {
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskPoints, setTaskPoints] = useState('10');
  const [taskPenalty, setTaskPenalty] = useState('5');
  const [taskType, setTaskType] = useState<TaskType>('glowne');
  
  const [tasksList, setTasksList] = useState<Task[]>([]);
  const [teamTasks, setTeamTasks] = useState<any[]>([]); // Relacje drużyna <-> zadanie
  const [teams, setTeams] = useState<Team[]>([]); // Lista drużyn do rozwijanego menu
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchZadaniaITeamy();
  }, []);

  const fetchZadaniaITeamy = async () => {
    setLoading(true);
    const { data: tData } = await supabase.from('tasks').select('*').order('utworzono_w', { ascending: false });
    if (tData) setTasksList(tData);
    
    const { data: ttData } = await supabase.from('team_tasks').select('*');
    if (ttData) setTeamTasks(ttData);

    const { data: teamsData } = await supabase.from('teams').select('*').order('nazwa', { ascending: true });
    if (teamsData) setTeams(teamsData);

    setLoading(false);
  };

  const handleCreateTask = async () => {
    if (!taskTitle.trim() || !taskDesc.trim()) return Alert.alert('Błąd', 'Podaj tytuł i opis!');
    setIsSubmitting(true);
    const { error } = await supabase.from('tasks').insert([{
      tytul: taskTitle.trim(), opis: taskDesc.trim(), typ: taskType,
      punkty_bazowe: parseInt(taskPoints) || 0, kara_za_pominiecie: parseInt(taskPenalty) || 0
    }]);
    setIsSubmitting(false);
    if (error) Alert.alert('Błąd', error.message);
    else { Alert.alert('Sukces', 'Dodano zadanie!'); setTaskTitle(''); setTaskDesc(''); fetchZadaniaITeamy(); }
  };

  const usunZadanie = async (id: string, title: string) => {
    Alert.alert('Usuń zadanie', `Czy usunąć zadanie "${title}" z bazy? Zniknie też z postępu drużyn.`, [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Usuń', style: 'destructive', onPress: async () => { await supabase.from('tasks').delete().eq('id', id); fetchZadaniaITeamy(); } }
    ]);
  };

  const toggleTaskAssignment = async (taskId: string, teamId: string, isCurrentlyAssigned: boolean) => {
    if (isCurrentlyAssigned) {
      const { error } = await supabase.from('team_tasks').delete().match({ task_id: taskId, team_id: teamId });
      if (error) Alert.alert('Błąd', error.message);
    } else {
      const { error } = await supabase.from('team_tasks').insert([{ task_id: taskId, team_id: teamId, status: 'aktywne' }]);
      if (error) Alert.alert('Błąd', error.message);
    }
    const { data: ttData } = await supabase.from('team_tasks').select('*');
    if (ttData) setTeamTasks(ttData);
  };

  // Funkcja pomocnicza do kolorków typów zadań
  const getTypeColor = (type: TaskType) => {
    if (type === 'special_event') return '#ffa502'; // Pomarańczowy
    if (type === 'sidequest') return '#9b59b6'; // Fioletowy
    return '#3742fa'; // Niebieski (Główne)
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>Dodaj Nowe Zadanie</Text>
      <View style={styles.formBox}>
        <TextInput style={styles.input} placeholder="Krótki tytuł (np. Wjazd do rzeki)" placeholderTextColor="#888" value={taskTitle} onChangeText={setTaskTitle} />
        <TextInput style={[styles.input, {height: 80, textAlignVertical: 'top'}]} placeholder="Szczegółowy opis dla graczy..." placeholderTextColor="#888" multiline value={taskDesc} onChangeText={setTaskDesc} />
        
        <View style={{flexDirection: 'row', gap: 10}}>
          <View style={{flex: 1}}><Text style={styles.label}>Punkty:</Text><TextInput style={styles.input} keyboardType="numeric" value={taskPoints} onChangeText={setTaskPoints} /></View>
          <View style={{flex: 1}}><Text style={styles.label}>Kara (-):</Text><TextInput style={styles.input} keyboardType="numeric" value={taskPenalty} onChangeText={setTaskPenalty} /></View>
        </View>

        <Text style={styles.label}>Typ Zadania:</Text>
        <View style={styles.row}>
          <TouchableOpacity style={[styles.roleBtn, taskType === 'glowne' && {backgroundColor: getTypeColor('glowne'), borderColor: getTypeColor('glowne')}]} onPress={() => setTaskType('glowne')}>
            <Text style={styles.roleBtnText}>GŁÓWNE (Dla wybranych)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.roleBtn, taskType === 'sidequest' && {backgroundColor: getTypeColor('sidequest'), borderColor: getTypeColor('sidequest')}]} onPress={() => setTaskType('sidequest')}>
            <Text style={styles.roleBtnText}>POBOCZNE (Dla wszystkich)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.roleBtn, taskType === 'special_event' && {backgroundColor: getTypeColor('special_event'), borderColor: getTypeColor('special_event')}]} onPress={() => setTaskType('special_event')}>
            <Text style={styles.roleBtnText}>SPECIAL (Kto pierwszy)</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.submitBtn} onPress={handleCreateTask} disabled={isSubmitting}>
          {isSubmitting ? <ActivityIndicator color="#000" /> : <Text style={styles.submitBtnText}>DODAJ DO BAZY</Text>}
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionTitle, {marginTop: 30}]}>Zarządzanie Zadaniami ({tasksList.length})</Text>
      {loading ? <ActivityIndicator color="#ff4757" style={{marginTop: 20}} /> : (
        tasksList.map(task => {
          const isExpanded = expandedTaskId === task.id;
          
          return (
          <View key={task.id} style={styles.card}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start'}}>
              <View style={{flex: 1, paddingRight: 10}}>
                <Text style={styles.cardTitle}>{task.tytul}</Text>
                <Text style={{color: '#ccc', fontSize: 13, marginVertical: 4}}>{task.opis}</Text>
                <Text style={styles.cardSub}>
                  Typ: <Text style={{color: getTypeColor(task.typ), fontWeight: 'bold'}}>{task.typ.toUpperCase()}</Text> | Pkt: {task.punkty_bazowe}
                </Text>
              </View>
              <TouchableOpacity onPress={() => usunZadanie(task.id, task.tytul)}>
                <Text style={styles.deleteText}>Usuń</Text>
              </TouchableOpacity>
            </View>

            {/* Rozwijane menu przypisywania TYLKO dla zadań GŁÓWNYCH */}
            {task.typ === 'glowne' && (
              <View style={{marginTop: 15, borderTopWidth: 1, borderTopColor: '#333', paddingTop: 10}}>
                <TouchableOpacity onPress={() => setExpandedTaskId(isExpanded ? null : task.id)} style={{backgroundColor: '#2a2a2a', padding: 10, borderRadius: 5, alignItems: 'center'}}>
                  <Text style={{color: '#fff', fontWeight: 'bold'}}>{isExpanded ? 'Zwiń przypisania ▲' : 'Przypisz do drużyn ▼'}</Text>
                </TouchableOpacity>

                {isExpanded && (
                  <View style={{marginTop: 10}}>
                    {teams.length === 0 && <Text style={{color: '#888'}}>Brak drużyn w bazie.</Text>}
                    {teams.map(team => {
                      const isAssigned = teamTasks.some(tt => tt.task_id === task.id && tt.team_id === team.id);
                      return (
                        <TouchableOpacity 
                          key={team.id} 
                          style={[styles.teamAssignRow, isAssigned && {borderColor: '#2ed573', backgroundColor: 'rgba(46, 213, 115, 0.1)'}]}
                          onPress={() => toggleTaskAssignment(task.id, team.id, isAssigned)}
                        >
                          <Text style={{color: isAssigned ? '#2ed573' : '#fff'}}>{team.nazwa}</Text>
                          <Text style={{color: isAssigned ? '#2ed573' : '#888'}}>{isAssigned ? 'ZAZNACZONE ✓' : 'Brak'}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
            
            {/* Informacja dla zadań pobocznych i specjalnych */}
            {task.typ !== 'glowne' && (
              <Text style={{color: '#888', fontSize: 12, marginTop: 10, fontStyle: 'italic'}}>
                To zadanie jest globalne i widoczne od razu dla wszystkich drużyn.
              </Text>
            )}
          </View>
        )})
      )}
      <View style={{height: 50}} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 15 },
  formBox: { backgroundColor: '#111', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#222' },
  input: { backgroundColor: '#1e1e1e', color: '#fff', padding: 12, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#333' },
  label: { color: '#aaa', marginTop: 10, marginBottom: 5, fontSize: 14, fontWeight: 'bold' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 15 },
  roleBtn: { paddingVertical: 10, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#444', backgroundColor: '#1e1e1e', flex: 1, alignItems: 'center' },
  roleBtnActive: { backgroundColor: '#3742fa', borderColor: '#3742fa' },
  roleBtnText: { color: '#fff', fontSize: 11, fontWeight: 'bold', textAlign: 'center' },
  submitBtn: { backgroundColor: '#2ed573', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  submitBtnText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
  card: { backgroundColor: '#1e1e1e', padding: 15, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#333' },
  cardTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  cardSub: { color: '#888', fontSize: 12, marginTop: 4 },
  deleteText: { color: '#ff4757', fontWeight: 'bold', padding: 5 },
  teamAssignRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderWidth: 1, borderColor: '#333', borderRadius: 5, marginBottom: 5, backgroundColor: '#111' }
});