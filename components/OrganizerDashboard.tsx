// @/components/OrganizerDashboard.tsx
import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Dimensions, Platform } from 'react-native';
import { Profile } from '@/types';

// Importy zakładek
import AccountsTab from './organizer/AccountsTab';
import TasksTab from './organizer/TasksTab';
import JudgingTab from './organizer/JudgingTab';
import BroadcastTab from './organizer/BroadcastTab';
import MapTab from './organizer/MapTab';
import GroupChat from './GroupChat';
import Leaderboard from './Leaderboard'; // Importujemy istniejący ranking
import GameManagementTab from './organizer/GameManagementTab';

const { width } = Dimensions.get('window');

export default function OrganizerDashboard({ userProfile, onLogout }: { userProfile: Profile, onLogout: any }) {
  const [activeTab, setActiveTab] = useState<string | null>(null);

  // Dodajemy kafel RANKING do listy
  const tiles = [
    { id: 'sedziowanie', label: 'SĘDZIA', icon: '⚖️', color: '#FF4757', sub: 'Werdykty' },
    { id: 'ranking', label: 'RANKING', icon: '🏆', color: '#F1C40F', sub: 'Wyniki live' }, // NOWY KAFEL
    { id: 'mapa', label: 'MAPA', icon: '📍', color: '#2ED573', sub: 'Pozycje GPS' },
    { id: 'komunikaty', label: 'ALERTY', icon: '📢', color: '#FFA502', sub: 'Broadcast' },
    { id: 'zadania', label: 'EDYCJA', icon: '⚙️', color: '#3742FA', sub: 'Zadania' },
    { id: 'chat_imp', label: 'IMPOSTOR', icon: '🕵️', color: '#8E44AD', sub: 'Podsłuch' },
    { id: 'chat_det', label: 'DETEKTYW', icon: '🔍', color: '#E67E22', sub: 'Podsłuch' },
    { id: 'chat_age', label: 'AGENCI', icon: '🕶️', color: '#2C3E50', sub: 'Podsłuch' },
    { id: 'konta', label: 'GRACZE', icon: '👥', color: '#7F8C8D', sub: 'Baza kont' },
    { id: 'zarzadzanie_gra', label: 'PARAMETRY', icon: '⚙️', color: '#6C5CE7', sub: 'Cele i limity' },
  ];

  if (activeTab) {
    return (
      <View style={styles.container}>
        {/* NAGŁÓWEK ZAKŁADKI - zwiększony odstęp dla lepszej klikalności */}
        <View style={styles.tabHeader}>
          <TouchableOpacity onPress={() => setActiveTab(null)} style={styles.backButton}>
            <Text style={styles.backButtonText}>← POWRÓT</Text>
          </TouchableOpacity>
          <Text style={styles.tabHeaderTitle}>
            {tiles.find(t => t.id === activeTab)?.label}
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          {activeTab === 'konta' && <AccountsTab />}
          {activeTab === 'zadania' && <TasksTab />}
          {activeTab === 'sedziowanie' && <JudgingTab />}
          {activeTab === 'komunikaty' && <BroadcastTab />}
          {activeTab === 'mapa' && <MapTab />}
          {activeTab === 'ranking' && <ScrollView><Leaderboard /></ScrollView>}
          {activeTab === 'chat_imp' && <GroupChat channel="impostor" userProfile={userProfile} />}
          {activeTab === 'chat_det' && <GroupChat channel="detektyw" userProfile={userProfile} />}
          {activeTab === 'chat_age' && <GroupChat channel="agenci" userProfile={userProfile} />}
          {activeTab === 'zarzadzanie_gra' && <GameManagementTab />}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.gridContainer}>
        <View style={styles.mainHeader}>
          <Text style={styles.mainTitle}>SZTAB DOWODZENIA</Text>
          <Text style={styles.mainSub}>System operacyjny v2.0</Text>
        </View>
        
        <View style={styles.grid}>
          {tiles.map(tile => (
            <TouchableOpacity 
              key={tile.id} 
              style={[styles.tile, { borderLeftColor: tile.color }]} 
              onPress={() => setActiveTab(tile.id)}
            >
              <Text style={styles.tileIcon}>{tile.icon}</Text>
              <View>
                <Text style={styles.tileLabel}>{tile.label}</Text>
                <Text style={styles.tileSubLabel}>{tile.sub}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity onPress={onLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>ZAMKNIJ SYSTEM</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#000',
    // Solidny margines od góry, by przyciski nie nachodziły na notch/status bar
    paddingTop: Platform.OS === 'ios' ? 60 : 50 
  },
  gridContainer: { padding: 20 },
  mainHeader: { marginBottom: 30, alignItems: 'center' },
  mainTitle: { color: '#fff', fontSize: 26, fontWeight: 'bold', letterSpacing: 2 },
  mainSub: { color: '#444', fontSize: 11, fontWeight: 'bold', marginTop: 5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  tile: { 
    width: (width / 2) - 30, 
    height: 90, 
    backgroundColor: '#111', 
    borderRadius: 12, 
    marginBottom: 15, 
    padding: 12, 
    flexDirection: 'row', 
    alignItems: 'center',
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#222'
  },
  tileIcon: { fontSize: 24, marginRight: 10 },
  tileLabel: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  tileSubLabel: { color: '#555', fontSize: 9, fontWeight: 'bold' },
  tabHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 20,
    paddingBottom: 15,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  tabHeaderTitle: { color: '#fff', marginLeft: 20, fontWeight: 'bold', letterSpacing: 1 },
  backButton: { 
    backgroundColor: '#222', 
    paddingHorizontal: 15, 
    paddingVertical: 8, 
    borderRadius: 8 
  },
  backButtonText: { color: '#FF4757', fontWeight: 'bold', fontSize: 12 },
  logoutBtn: { marginTop: 20, padding: 20, alignItems: 'center' },
  logoutText: { color: '#333', fontWeight: 'bold', fontSize: 12 }
});