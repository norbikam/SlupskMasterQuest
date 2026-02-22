import React, { useState, useEffect } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Vibration } from 'react-native';
import { supabase } from '@/supabase';

export default function GlobalAlertModal() {
  const [activeAlert, setActiveAlert] = useState<any | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel('global_alerts_stream')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'global_alerts' },
        (payload) => {
          console.log("🔥 ALERT ODEBRANY!", payload.new.tresc);
          setActiveAlert(payload.new);
          Vibration.vibrate(500);
        }
      )
      .subscribe((status) => {
        // Jeśli tu zobaczysz 'SUBSCRIBED', to znaczy że połączenie jest stabilne
        console.log("📡 Status połączenia z alertami:", status);
      });

    return () => { supabase.removeChannel(channel); };
  }, []);

  if (!activeAlert) return null;

  return (
    <Modal transparent visible={!!activeAlert} animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.badge}>KOMUNIKAT SZTABU ⚠️</Text>
          
          <Text style={styles.title}>OGŁOSZENIE</Text>
          
          <View style={styles.contentContainer}>
            <Text style={styles.messageText}>
              {activeAlert.tresc}
            </Text>
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity 
              style={styles.closeBtn} 
              onPress={() => setActiveAlert(null)}
            >
              <Text style={styles.btnText}>ZROZUMIAŁEM</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)', // Ciemniejsze tło dla lepszej czytelności
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modal: {
    width: '100%',
    backgroundColor: '#121212',
    borderRadius: 25,
    padding: 25,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ff4757', // Czerwony kolor dla komunikatów
    elevation: 20,
  },
  badge: {
    backgroundColor: '#ff4757',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    fontWeight: 'bold',
    fontSize: 12,
    marginBottom: 15,
    letterSpacing: 1
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20
  },
  contentContainer: {
    width: '100%',
    padding: 15,
    backgroundColor: '#1a1a1a',
    borderRadius: 15,
    marginBottom: 25,
    borderWidth: 1,
    borderColor: '#333'
  },
  messageText: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
    lineHeight: 26,
    fontWeight: '500'
  },
  btnRow: {
    width: '100%',
  },
  closeBtn: {
    backgroundColor: '#fff',
    paddingVertical: 18,
    borderRadius: 15,
    alignItems: 'center',
    width: '100%'
  },
  btnText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 1
  }
});