// App.tsx
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/supabase';
import { Profile } from '@/types';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Importujemy nasz panel Organizatora
import OrganizerDashboard from '@/components/OrganizerDashboard';
import PlayerDashboard from '@/components/PlayerDashboard';
import SpecialEventModal from '@/components/SpecialEventModal';

export default function App() {
  // Stan formularza logowania
  const [login, setLogin] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  
  // Stan sesji
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Wczytywanie zapisanej sesji przy uruchomieniu aplikacji
  useEffect(() => {
    const checkSession = async () => {
      try {
        const storedId = await AsyncStorage.getItem('user_id');
        if (storedId) {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', storedId)
            .single<Profile>();
            
          if (data && !error) {
            setUserProfile(data);
          } else {
            // Jeśli wystąpił błąd lub użytkownik został usunięty z bazy, czyścimy pamięć
            await AsyncStorage.removeItem('user_id');
          }
        }
      } catch (error) {
        console.error('Błąd odczytu sesji:', error);
      } finally {
        setLoading(false);
      }
    };
    checkSession();
  }, []);

  // Obsługa logowania
  const handleLogin = async () => {
    if (login.trim() === '' || password.trim() === '') {
      Alert.alert('Błąd', 'Podaj login i hasło!');
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('login', login.trim().toLowerCase()) // Zapobiega błędom, gdy ktoś wpisze login wielką literą
      .eq('haslo', password.trim())
      .single<Profile>();

    if (error || !data) {
      Alert.alert('Błąd Logowania', 'Nieprawidłowy login lub hasło! Skontaktuj się z organizatorem.');
      setLoading(false);
      return;
    }

    // Zapisujemy ID do pamięci i ustawiamy profil w stanie aplikacji
    await AsyncStorage.setItem('user_id', data.id);
    setUserProfile(data);
    setLoading(false);
  };

  // Obsługa wylogowania
  const handleLogout = async () => {
    await AsyncStorage.removeItem('user_id');
    setUserProfile(null);
    setLogin('');
    setPassword('');
  };

  // 1. EKRAN ŁADOWANIA
  if (loading) {
    return (
      <SafeAreaProvider>
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#ff4757" />
        <Text style={styles.loadingText}>Ładowanie...</Text>
      </View>
      </SafeAreaProvider>
    );
  }

  // 2. EKRAN PO ZALOGOWANIU
  if (userProfile) {
    // 🔴 KONTO ORGANIZATORA (WIDOK GOD MODE)
    if (userProfile.rola === 'organizator') {
      return(
        <SafeAreaProvider>
        <OrganizerDashboard userProfile={userProfile} onLogout={handleLogout} />
        </SafeAreaProvider>);
    }

    // 🔵 KONTO GRACZA LUB LIDERA
    return (<>
    <SafeAreaProvider>
    <SpecialEventModal userProfile={userProfile} />
    <PlayerDashboard userProfile={userProfile} onLogout={handleLogout} />
    </SafeAreaProvider>
  </>
  );
  }

  // 3. EKRAN LOGOWANIA (Domyślny)
  return (
    <SafeAreaProvider>
    <View style={styles.container}>
      <Text style={styles.title}>SłupskMasterQuest 2.0</Text>
      <Text style={styles.subtitle}>18.07.2026</Text>
      
      <TextInput
        style={styles.input}
        placeholder="Twój login..."
        placeholderTextColor="#888"
        value={login}
        onChangeText={setLogin}
        autoCapitalize="none"
        autoCorrect={false}
      />
      
      <TextInput
        style={styles.input}
        placeholder="Twoje hasło..."
        placeholderTextColor="#888"
        value={password}
        onChangeText={setPassword}
        secureTextEntry // Gwiazdki zamiast tekstu (ukrywa hasło)
      />

      <TouchableOpacity style={styles.button} onPress={handleLogin}>
        <Text style={styles.buttonText}>WEJDŹ DO GRY</Text>
      </TouchableOpacity>
    </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#ff4757',
    marginTop: 15,
    fontSize: 16,
    fontWeight: 'bold',
  },
  container: { 
    flex: 1, 
    backgroundColor: '#121212', 
    justifyContent: 'center', 
    padding: 20 
  },
  title: { 
    fontSize: 32, 
    fontWeight: 'bold', 
    color: '#fff', 
    textAlign: 'center', 
    marginBottom: 10 
  },
  subtitle: { 
    fontSize: 16, 
    color: '#e31010', 
    textAlign: 'center', 
    marginBottom: 20 
  },
  input: { 
    backgroundColor: '#1e1e1e', 
    color: '#fff', 
    fontSize: 18, 
    padding: 15, 
    borderRadius: 8, 
    borderWidth: 1, 
    borderColor: '#333', 
    marginBottom: 20 
  },
  button: { 
    backgroundColor: '#ff4757', 
    padding: 15, 
    borderRadius: 8, 
    alignItems: 'center',
    marginTop: 10
  },
  logoutButton: {
    backgroundColor: '#333', 
    padding: 15, 
    borderRadius: 8, 
    alignItems: 'center',
    marginTop: 40
  },
  buttonText: { 
    color: '#fff', 
    fontSize: 18, 
    fontWeight: 'bold' 
  },
  placeholderBox: {
    backgroundColor: '#1a1a1a',
    padding: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    marginTop: 20
  }
});