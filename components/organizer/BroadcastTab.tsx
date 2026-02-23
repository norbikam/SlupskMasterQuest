import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { supabase } from '@/supabase';

export default function BroadcastTab() {
  const [msg, setMsg] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    fetchHistory();
    const channel = supabase.channel('admin_broadcast_sync')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'global_alerts' }, () => fetchHistory()).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchHistory = async () => {
    setLoading(true);
    const { data } = await supabase.from('global_alerts').select('*').order('utworzono_w', { ascending: false }).limit(10);
    if (data) setHistory(data);
    setLoading(false);
  };

  const sendPushNotification = async (title: string, body: string) => {
    const { data: profiles } = await supabase.from('profiles').select('expo_push_token').not('expo_push_token', 'is', null);
    if (!profiles || profiles.length === 0) return;

    const messages = profiles.map(p => ({
      to: p.expo_push_token,
      sound: 'default',
      title: title,
      body: body,
    }));

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Accept-encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
  };

  const handleSendAlert = async () => {
    if (!msg.trim()) return Alert.alert("Błąd", "Wiadomość nie może być pusta!");
    setIsSending(true);
    
    const { error } = await supabase.from('global_alerts').insert([{ tresc: msg.trim() }]);

    if (error) {
      Alert.alert("Błąd wysyłki", error.message);
    } else {
      Alert.alert("Sukces", "Komunikat został wysłany.");
      
      // WYSYŁAMY POWIADOMIENIE PUSH O ALERCIE
      sendPushNotification("📢 ALERT SYSTEMOWY", msg.trim());
      setMsg('');
    }
    setIsSending(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputCard}>
        <Text style={styles.cardLabel}>NOWY ALERT SYSTEMOWY</Text>
        <TextInput style={styles.input} placeholder="Wpisz treść komunikatu..." placeholderTextColor="#444" multiline value={msg} onChangeText={setMsg} />
        <TouchableOpacity style={[styles.sendBtn, isSending && { opacity: 0.6 }]} onPress={handleSendAlert} disabled={isSending}>
          {isSending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendBtnText}>ROZESŁAJ KOMUNIKAT 📢</Text>}
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>OSTATNIO WYSŁANE</Text>
      <ScrollView style={styles.historyList} showsVerticalScrollIndicator={false}>
        {loading && history.length === 0 ? <ActivityIndicator color="#ff4757" style={{ marginTop: 20 }} /> : 
          history.map((item) => (
            <View key={item.id} style={styles.historyCard}>
              <View style={styles.historyHeader}>
                <Text style={styles.historyTime}>{new Date(item.utworzono_w).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
              <Text style={styles.historyText}>{item.tresc}</Text>
            </View>
          ))
        }
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 20 : 10 },
  inputCard: { backgroundColor: '#111', borderRadius: 15, padding: 15, borderWidth: 1, borderColor: '#222', marginBottom: 30 },
  cardLabel: { color: '#ff4757', fontSize: 10, fontWeight: 'bold', letterSpacing: 1.5, marginBottom: 10 },
  input: { backgroundColor: '#000', color: '#fff', borderRadius: 10, padding: 15, fontSize: 16, minHeight: 100, textAlignVertical: 'top', borderWidth: 1, borderColor: '#333' },
  sendBtn: { backgroundColor: '#ff4757', paddingVertical: 15, borderRadius: 10, marginTop: 15, alignItems: 'center' },
  sendBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14, letterSpacing: 1 },
  sectionTitle: { color: '#444', fontSize: 12, fontWeight: 'bold', marginBottom: 15, letterSpacing: 1 },
  historyList: { flex: 1 },
  historyCard: { backgroundColor: '#0a0a0a', borderRadius: 12, padding: 15, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#333', borderWidth: 1, borderColor: '#1a1a1a' },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  historyTime: { color: '#555', fontSize: 10, fontWeight: 'bold' },
  historyText: { color: '#aaa', fontSize: 14, lineHeight: 20 }
});