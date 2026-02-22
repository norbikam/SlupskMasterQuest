import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, TouchableOpacity, ScrollView, Platform } from 'react-native';
import MapView, { Marker, Callout, Circle } from 'react-native-maps';
import { supabase } from '@/supabase';

// Slupsk center
const SLUPSK = { latitude: 54.4641, longitude: 17.0285, latitudeDelta: 0.06, longitudeDelta: 0.06 };

// Kolorki dla drużyn
const TEAM_COLORS = ['#ff4757', '#2ed573', '#1e90ff', '#ffa502', '#a29bfe', '#fd79a8', '#fdcb6e', '#6c5ce7'];

export default function MapTab() {
  const [teams, setTeams] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLayers, setShowLayers] = useState({ teams: true, tasks: true, players: false });

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel('map_realtime_v2')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_tasks' }, () => fetchAll())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchAll = async () => {
    const [teamsRes, tasksRes, profilesRes] = await Promise.all([
      supabase
        .from('teams')
        .select('id, nazwa, punkty, aktywny_zestaw_id')
        .order('punkty', { ascending: false }),
      supabase
        .from('tasks')
        .select('id, tytul, latitude, longitude, promien_metry, typ, zestaw_id')
        .not('latitude', 'is', null),
      supabase
        .from('profiles')
        .select('id, imie_pseudonim, rola, team_id, latitude, longitude')
        .not('latitude', 'is', null),
    ]);

    if (teamsRes.data) setTeams(teamsRes.data);
    if (tasksRes.data) setTasks(tasksRes.data);
    if (profilesRes.data) setProfiles(profilesRes.data);
    setLoading(false);
  };

  // Kolor drużyny wg indeksu
  const teamColor = (teamId: string) => {
    const idx = teams.findIndex((t) => t.id === teamId);
    return TEAM_COLORS[idx % TEAM_COLORS.length] ?? '#888';
  };

  // Kolor zadania wg typu
  const taskColor = (typ: string) => {
    if (typ === 'glowne') return '#3742fa';
    if (typ === 'sidequest') return '#2ed573';
    if (typ === 'special_event') return '#ffa502';
    return '#888';
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#ff4757" size="large" />
        <Text style={styles.loadingText}>Ładowanie mapy...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFillObject}
        initialRegion={SLUPSK}
        showsUserLocation={false}
        showsCompass
        showsScale
      >
        {/* ── ZADANIA ── */}
        {showLayers.tasks &&
          tasks.map((task) => (
            <React.Fragment key={task.id}>
              <Circle
                center={{ latitude: task.latitude, longitude: task.longitude }}
                radius={task.promien_metry || 50}
                fillColor={`${taskColor(task.typ)}33`}
                strokeColor={taskColor(task.typ)}
                strokeWidth={1.5}
              />
              <Marker
                coordinate={{ latitude: task.latitude, longitude: task.longitude }}
                pinColor={taskColor(task.typ)}
              >
                <Callout tooltip>
                  <View style={styles.calloutBox}>
                    <Text style={[styles.calloutTitle, { color: taskColor(task.typ) }]}>
                      {task.typ === 'glowne' ? '🎯' : task.typ === 'sidequest' ? '🌟' : '⚡'} {task.tytul}
                    </Text>
                    <Text style={styles.calloutSub}>{task.typ.toUpperCase()} | R={task.promien_metry || 50}m</Text>
                    {task.zestaw_id && <Text style={styles.calloutSub}>{task.zestaw_id}</Text>}
                  </View>
                </Callout>
              </Marker>
            </React.Fragment>
          ))}

        {/* ── GRACZE Z GPS ── */}
        {showLayers.players &&
          profiles.map((p) => (
            <Marker
              key={p.id}
              coordinate={{ latitude: p.latitude, longitude: p.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={[styles.playerDot, { backgroundColor: p.team_id ? teamColor(p.team_id) : '#888' }]}>
                <Text style={styles.playerDotText}>
                  {p.rola === 'impostor' ? '🎭' : p.rola === 'detektyw' ? '🔍' : '🕶️'}
                </Text>
              </View>
              <Callout tooltip>
                <View style={styles.calloutBox}>
                  <Text style={styles.calloutTitle}>{p.imie_pseudonim}</Text>
                  <Text style={styles.calloutSub}>{p.rola.toUpperCase()}</Text>
                </View>
              </Callout>
            </Marker>
          ))}
      </MapView>

      {/* ── LEGENDA / FILTRY (góra) ── */}
      <View style={styles.topBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topBarContent}>
          <TouchableOpacity
            style={[styles.layerBtn, showLayers.tasks && styles.layerBtnActive]}
            onPress={() => setShowLayers({ ...showLayers, tasks: !showLayers.tasks })}
          >
            <Text style={styles.layerBtnText}>🎯 ZADANIA</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.layerBtn, showLayers.players && styles.layerBtnActive]}
            onPress={() => setShowLayers({ ...showLayers, players: !showLayers.players })}
          >
            <Text style={styles.layerBtnText}>🕶️ GRACZE</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* ── PANEL RANKING (dół) ── */}
      <View style={styles.bottomPanel}>
        <Text style={styles.bottomTitle}>DRUŻYNY ({teams.length})</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {teams.map((team, idx) => (
            <View key={team.id} style={[styles.teamChip, { borderColor: TEAM_COLORS[idx % TEAM_COLORS.length] }]}>
              <View style={[styles.teamDot, { backgroundColor: TEAM_COLORS[idx % TEAM_COLORS.length] }]} />
              <Text style={styles.teamChipName} numberOfLines={1}>{team.nazwa}</Text>
              <Text style={styles.teamChipPts}>{team.punkty} pkt</Text>
            </View>
          ))}
        </ScrollView>

        {/* Legenda zadań */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#3742fa' }]} />
            <Text style={styles.legendText}>Główne</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#2ed573' }]} />
            <Text style={styles.legendText}>Sidequest</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#ffa502' }]} />
            <Text style={styles.legendText}>Special</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#666', marginTop: 10, fontWeight: 'bold' },

  // Filtry
  topBar: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    zIndex: 10,
  },
  topBarContent: { gap: 8 },
  layerBtn: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  layerBtnActive: { borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.15)' },
  layerBtnText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  // Callout
  calloutBox: {
    backgroundColor: '#111',
    padding: 12,
    borderRadius: 10,
    minWidth: 140,
    borderWidth: 1,
    borderColor: '#333',
  },
  calloutTitle: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  calloutSub: { color: '#666', fontSize: 10, marginTop: 3 },

  // Player dot
  playerDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  playerDotText: { fontSize: 14 },

  // Panel dolny
  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.88)',
    padding: 15,
    paddingBottom: Platform.OS === 'ios' ? 30 : 15,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  bottomTitle: { color: '#444', fontSize: 9, fontWeight: 'bold', letterSpacing: 2, marginBottom: 10 },
  teamChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    marginRight: 8,
    gap: 6,
  },
  teamDot: { width: 8, height: 8, borderRadius: 4 },
  teamChipName: { color: '#fff', fontSize: 12, fontWeight: 'bold', maxWidth: 100 },
  teamChipPts: { color: '#aaa', fontSize: 10 },

  legend: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: '#555', fontSize: 10 },
});
