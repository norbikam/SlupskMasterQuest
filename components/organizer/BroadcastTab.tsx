import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  Alert, 
  ScrollView, 
  ActivityIndicator,
  Platform 
} from 'react-native';
import { supabase } from '@/supabase';

export default function BroadcastTab() {
  const [msg, setMsg] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    fetchHistory();

    // Subskrypcja, aby historia u admina odświeżała się natychmiast po wysłaniu
    const channel = supabase
      .channel('admin_broadcast_sync')
      .on(
        'postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'global_alerts' }, 
        () => fetchHistory()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchHistory = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('global_alerts')
      .select('*')
      .order('utworzono_w', { ascending: false })
      .limit(10);

    if (error) console.error("Błąd pobierania historii:", error);
    if (data) setHistory(data);
    setLoading(false);
  };

  const handleSendAlert = async () => {
    if (!msg.trim()) {
      Alert.alert("Błąd", "Wiadomość nie może być pusta!");
      return;
    }

    setIsSending(true);
    
    // WYSYŁKA DO TABELI global_alerts
    const { error } = await supabase
      .from('global_alerts')
      .insert([{ tresc: msg.trim(), typ: 'alert' }]);

    if (error) {
      Alert.alert("Błąd wysyłki", error.message);
    } else {
      setMsg('');
      Alert.alert("Sukces", "Komunikat został wysłany do wszystkich graczy.");
    }
    
    setIsSending(false);
  };

  return (
    <View style={styles.container}>
      {/* SEKCJA NADAWCZA */}
      <View style={styles.inputCard}>
        <Text style={styles.cardLabel}>NOWY ALERT SYSTEMOWY</Text>
        <TextInput
          style={styles.input}
          placeholder="Wpisz treść komunikatu, który zablokuje ekrany graczy..."
          placeholderTextColor="#444"
          multiline
          value={msg}
          onChangeText={setMsg}
        />
        
        <TouchableOpacity 
          style={[styles.sendBtn, isSending && { opacity: 0.6 }]} 
          onPress={handleSendAlert}
          disabled={isSending}
        >
          {isSending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.sendBtnText}>ROZESŁAJ KOMUNIKAT 📢</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* HISTORIA */}
      <Text style={styles.sectionTitle}>OSTATNIO WYSŁANE</Text>
      
      <ScrollView 
        style={styles.historyList}
        showsVerticalScrollIndicator={false}
      >
        {loading && history.length === 0 ? (
          <ActivityIndicator color="#ff4757" style={{ marginTop: 20 }} />
        ) : (
          history.map((item) => (
            <View key={item.id} style={styles.historyCard}>
              <View style={styles.historyHeader}>
                <Text style={styles.historyTime}>
                  {new Date(item.utworzono_w).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
                <View style={styles.statusDot} />
              </View>
              <Text style={styles.historyText}>{item.tresc}</Text>
            </View>
          ))
        )}
        
        {!loading && history.length === 0 && (
          <Text style={styles.emptyText}>Brak wysłanych komunikatów.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#000', 
    paddingHorizontal: 20,
    // Solidny padding od góry, aby nic nie zasłaniało przycisków
    paddingTop: Platform.OS === 'ios' ? 20 : 10,
  },
  inputCard: {
    backgroundColor: '#111',
    borderRadius: 15,
    padding: 15,
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 30,
  },
  cardLabel: {
    color: '#ff4757',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#000',
    color: '#fff',
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#333',
  },
  sendBtn: {
    backgroundColor: '#ff4757',
    paddingVertical: 15,
    borderRadius: 10,
    marginTop: 15,
    alignItems: 'center',
    shadowColor: '#ff4757',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  sendBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 1,
  },
  sectionTitle: {
    color: '#444',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 15,
    letterSpacing: 1,
  },
  historyList: {
    flex: 1,
  },
  historyCard: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#333',
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  historyTime: {
    color: '#555',
    fontSize: 10,
    fontWeight: 'bold',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2ed573',
  },
  historyText: {
    color: '#aaa',
    fontSize: 14,
    lineHeight: 20,
  },
  emptyText: {
    color: '#333',
    textAlign: 'center',
    marginTop: 40,
    fontStyle: 'italic',
  }
});