import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/supabase';
import { Profile } from '@/types';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

import OrganizerDashboard from '@/components/OrganizerDashboard';
import PlayerDashboard from '@/components/PlayerDashboard';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function registerForPushNotificationsAsync(userId: string) {
  let token;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return; // Gracz nie zgodził się na powiadomienia
    
    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? 'c9201773-e482-4ca5-a8ce-e1e945effe4d';
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      if (token) {
        await supabase.from('profiles').update({ expo_push_token: token }).eq('id', userId);
      }
    } catch (e) {
      console.log('Błąd tokenu push:', e);
    }
  }
}

export default function App() {
  const [login, setLogin] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const storedId = await AsyncStorage.getItem('user_id');
        if (storedId) {
          const { data, error } = await supabase.from('profiles').select('*').eq('id', storedId).single<Profile>();
          if (data && !error) {
            setUserProfile(data);
            registerForPushNotificationsAsync(data.id); // Odświeżenie tokenu
          } else {
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

  const handleLogin = async () => {
    if (login.trim() === '' || password.trim() === '') return Alert.alert('Błąd', 'Podaj login i hasło!');
    setLoading(true);

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('login', login.trim().toLowerCase())
      .eq('haslo', password.trim())
      .single<Profile>();

    if (error || !data) {
      Alert.alert('Błąd Logowania', 'Nieprawidłowy login lub hasło!');
      setLoading(false);
      return;
    }

    await AsyncStorage.setItem('user_id', data.id);
    setUserProfile(data);
    registerForPushNotificationsAsync(data.id); // Rejestracja powiadomień po nowym zalogowaniu
    setLoading(false);
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('user_id');
    setUserProfile(null);
    setLogin(''); setPassword('');
  };

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

  if (userProfile) {
    if (userProfile.rola === 'organizator') {
      return(
        <SafeAreaProvider>
          <OrganizerDashboard userProfile={userProfile} onLogout={handleLogout} />
        </SafeAreaProvider>
      );
    }
    return (
      <SafeAreaProvider>
        <PlayerDashboard userProfile={userProfile} onLogout={handleLogout} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        <Text style={styles.title}>SłupskMasterQuest 2.0</Text>
        <Text style={styles.subtitle}>18.07.2026</Text>
        <TextInput style={styles.input} placeholder="Twój login..." placeholderTextColor="#888" value={login} onChangeText={setLogin} autoCapitalize="none" autoCorrect={false} />
        <TextInput style={styles.input} placeholder="Twoje hasło..." placeholderTextColor="#888" value={password} onChangeText={setPassword} secureTextEntry />
        <TouchableOpacity style={styles.button} onPress={handleLogin}>
          <Text style={styles.buttonText}>WEJDŹ DO GRY</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  centerContainer: { flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#ff4757', marginTop: 15, fontSize: 16, fontWeight: 'bold' },
  container: { flex: 1, backgroundColor: '#121212', justifyContent: 'center', padding: 20 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 10 },
  subtitle: { fontSize: 16, color: '#ff0000', textAlign: 'center', marginBottom: 20 },
  input: { backgroundColor: '#1e1e1e', color: '#fff', fontSize: 18, padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#333', marginBottom: 20 },
  button: { backgroundColor: '#ff4757', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }
});