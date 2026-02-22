import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { supabase } from '@/supabase';

export default function GlobalChat() {
  const [lastMsg, setLastMsg] = useState<string | null>(null);
  const fadeAnim = new Animated.Value(0);

  useEffect(() => {
    // Nasłuchiwanie nowych wiadomości
    const channel = supabase
      .channel('global_chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'global_messages' }, (payload) => {
        setLastMsg(payload.new.tresc);
        showBanner();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const showBanner = () => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.delay(8000), // Wiadomość wisi 8 sekund
      Animated.timing(fadeAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start(() => setLastMsg(null));
  };

  if (!lastMsg) return null;

  return (
    <Animated.View style={[styles.banner, { opacity: fadeAnim }]}>
      <Text style={styles.header}>NAGŁY KOMUNIKAT 🚨</Text>
      <Text style={styles.text}>{lastMsg}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: { position: 'absolute', top: 50, left: 20, right: 20, backgroundColor: '#ff4757', padding: 15, borderRadius: 12, zIndex: 9999, elevation: 10, borderWidth: 2, borderColor: '#fff' },
  header: { color: '#000', fontWeight: 'bold', fontSize: 12, marginBottom: 5, textAlign: 'center' },
  text: { color: '#fff', fontWeight: 'bold', textAlign: 'center', fontSize: 16 }
});