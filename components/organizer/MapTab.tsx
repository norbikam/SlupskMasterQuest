import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import MapView, { Marker, Callout } from 'react-native-maps';
import { supabase } from '@/supabase';
import { Team } from '@/types';

export default function MapTab() {
  const [teams, setTeams] = useState<Team[]>([]);

  useEffect(() => {
    fetchTeams();

    const channel = supabase
      .channel('map_realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'teams' }, () => {
        fetchTeams();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchTeams = async () => {
    const { data } = await supabase.from('teams').select('*');
    if (data) setTeams(data.filter(t => t.latitude && t.longitude));
  };

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: 54.46849466052652, 
          longitude: 17.030816408549402,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {teams.map((team) => (
          <Marker
            key={team.id}
            coordinate={{ latitude: team.latitude!, longitude: team.longitude! }}
            pinColor="#ff4757"
          >
            <Callout>
              <View style={styles.callout}>
                <Text style={styles.teamName}>{team.nazwa}</Text>
                <Text>Punkty: {team.punkty}</Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },
  callout: { padding: 10, minWidth: 100 },
  teamName: { fontWeight: 'bold', color: '#ff4757' }
});