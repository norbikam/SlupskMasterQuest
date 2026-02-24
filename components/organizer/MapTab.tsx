import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Dimensions, Platform } from 'react-native';
import MapView, { Marker, Callout, PROVIDER_DEFAULT } from 'react-native-maps';
import { supabase } from '@/supabase';

const { width } = Dimensions.get('window');

// Mroczny styl mapy (w JSON)
const darkMapStyle = [
  { "elementType": "geometry", "stylers": [{ "color": "#242f3e" }] },
  { "elementType": "labels.text.fill", "stylers": [{ "color": "#746855" }] },
  { "elementType": "labels.text.stroke", "stylers": [{ "color": "#242f3e" }] },
  { "featureType": "administrative.locality", "elementType": "labels.text.fill", "stylers": [{ "color": "#d59563" }] },
  { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#d59563" }] },
  { "featureType": "poi.park", "elementType": "geometry", "stylers": [{ "color": "#263c3f" }] },
  { "featureType": "poi.park", "elementType": "labels.text.fill", "stylers": [{ "color": "#6b9a76" }] },
  { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#38414e" }] },
  { "featureType": "road", "elementType": "geometry.stroke", "stylers": [{ "color": "#212a37" }] },
  { "featureType": "road", "elementType": "labels.text.fill", "stylers": [{ "color": "#9ca5b3" }] },
  { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#746855" }] },
  { "featureType": "road.highway", "elementType": "geometry.stroke", "stylers": [{ "color": "#1f2835" }] },
  { "featureType": "road.highway", "elementType": "labels.text.fill", "stylers": [{ "color": "#f3d19c" }] },
  { "featureType": "transit", "elementType": "geometry", "stylers": [{ "color": "#2f3948" }] },
  { "featureType": "transit.station", "elementType": "labels.text.fill", "stylers": [{ "color": "#d59563" }] },
  { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#17263c" }] },
  { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#515c6d" }] },
  { "featureType": "water", "elementType": "labels.text.stroke", "stylers": [{ "color": "#17263c" }] }
];

export default function MapTab() {
  const [teams, setTeams] = useState<any[]>([]);
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    fetchTeams();

    const channel = supabase
      .channel('map_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => {
        fetchTeams();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchTeams = async () => {
    const { data } = await supabase.from('teams').select('*');
    if (data) {
      // Pobieramy tylko te drużyny, które zdążyły wysłać swoją pozycję GPS
      setTeams(data.filter(t => t.latitude && t.longitude));
    }
  };

  // Funkcja latającej kamery do danej drużyny (jak w Find My)
  const focusOnTeam = (latitude: number, longitude: number) => {
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        latitude,
        longitude,
        latitudeDelta: 0.005, // Bardzo bliskie przybliżenie
        longitudeDelta: 0.005,
      }, 1000); // Czas animacji: 1 sekunda
    }
  };

  return (
    <View style={styles.container}>
      {/* 1. MAPA ZAJMUJĄCA CAŁE TŁO */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        customMapStyle={darkMapStyle}
        showsUserLocation={false}
        initialRegion={{
          latitude: 54.4641, 
          longitude: 17.0285, // Słupsk - środek
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {teams.map((team) => (
          <Marker
            key={team.id}
            coordinate={{ latitude: team.latitude, longitude: team.longitude }}
            title={team.nazwa}
            description={`Punkty: ${team.punkty || 0}`}
            pinColor="#3498DB"
          >
            {/* Customowy wygląd pinezki */}
            <View style={styles.customMarker}>
              <Text style={styles.markerText}>{team.nazwa.substring(0, 2).toUpperCase()}</Text>
            </View>

            <Callout tooltip>
              <View style={styles.callout}>
                <Text style={styles.calloutTitle}>{team.nazwa}</Text>
                <Text style={styles.calloutSub}>Punkty: {team.punkty || 0}</Text>
                <Text style={styles.calloutDist}>ONLINE 🟢</Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {/* 2. MENU Z DRUŻYNAMI NA DOLE (Find My Style) */}
      <View style={styles.bottomSheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>LOKALIZACJA DRUŻYN ({teams.length})</Text>
        
        {teams.length === 0 ? (
          <Text style={styles.emptyText}>Brak sygnału GPS od jakiejkolwiek drużyny.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.teamsList}>
            {teams.map(team => (
              <TouchableOpacity 
                key={team.id} 
                style={styles.teamCard}
                onPress={() => focusOnTeam(team.latitude, team.longitude)}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{team.nazwa.substring(0, 1).toUpperCase()}</Text>
                </View>
                <Text style={styles.cardName} numberOfLines={1}>{team.nazwa}</Text>
                <Text style={styles.cardPoints}>{team.punkty || 0} PKT</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  map: { flex: 1, ...StyleSheet.absoluteFillObject },
  
  // Customowy Marker
  customMarker: { backgroundColor: '#3498DB', width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff', shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.8, shadowRadius: 3 },
  markerText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },

  // Chmurka po kliknięciu pinezki
  callout: { backgroundColor: '#111', padding: 15, borderRadius: 15, minWidth: 120, alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  calloutTitle: { color: '#fff', fontWeight: 'bold', fontSize: 14, marginBottom: 5 },
  calloutSub: { color: '#aaa', fontSize: 11, fontWeight: 'bold' },
  calloutDist: { color: '#2ed573', fontSize: 10, fontWeight: 'bold', marginTop: 8 },

  // Bottom Sheet z listą
  bottomSheet: { position: 'absolute', bottom: 0, width: '100%', backgroundColor: 'rgba(15,15,15,0.92)', borderTopLeftRadius: 25, borderTopRightRadius: 25, paddingVertical: 15, borderTopWidth: 1, borderColor: '#333' },
  sheetHandle: { width: 40, height: 4, backgroundColor: '#444', borderRadius: 2, alignSelf: 'center', marginBottom: 15 },
  sheetTitle: { color: '#fff', fontSize: 12, fontWeight: 'bold', textAlign: 'center', letterSpacing: 2, marginBottom: 15 },
  emptyText: { color: '#666', textAlign: 'center', fontSize: 12, marginBottom: 20 },
  
  teamsList: { paddingHorizontal: 15, paddingBottom: 10 },
  teamCard: { backgroundColor: '#222', padding: 15, borderRadius: 15, marginRight: 15, width: width * 0.35, alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#3498DB', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  cardName: { color: '#fff', fontWeight: 'bold', fontSize: 12, textAlign: 'center', marginBottom: 4 },
  cardPoints: { color: '#2ed573', fontWeight: 'bold', fontSize: 10 }
});