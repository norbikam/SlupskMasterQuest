import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '@/supabase';

export default function GroupChat({ channel, userProfile }: { channel: string, userProfile: any }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');

  useEffect(() => {
    fetchMessages();
    const sub = supabase.channel(`chat_${channel}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel=eq.${channel}` }, 
      payload => setMessages(prev => [payload.new, ...prev]))
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [channel]);

  const fetchMessages = async () => {
    const { data } = await supabase.from('chat_messages').select('*').eq('channel', channel).order('created_at', { ascending: false }).limit(50);
    if (data) setMessages(data);
  };

  const sendMessage = async () => {
    if (!inputText.trim()) return;
    await supabase.from('chat_messages').insert([{ channel, sender_id: userProfile.id, text: inputText.trim() }]);
    setInputText('');
  };

  const getAnonNick = (senderId: string) => {
  if (senderId === userProfile.id) return "TY";
  
  // Jeśli to pisze organizator (on nie jest anonimowy dla graczy, lub jest - Ty decydujesz)
  // Załóżmy, że organizator na czacie frakcyjnym też jest anonimowy jako "SYSTEM"
  
  // Stały pseudonim dla danego ID w tej grze:
  const hash = senderId.split('-')[0].toUpperCase(); 
  return `OPERATOR_${hash}`; 
    };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <Text style={styles.channelHeader}>CZAT: {channel.toUpperCase()}</Text>
      <FlatList
        inverted
        data={messages}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={[styles.msgBox, item.sender_id === userProfile.id ? styles.myMsg : styles.otherMsg]}>
            <Text style={styles.msgText}>{item.text}</Text>
          </View>
        )}
      />
      <View style={styles.inputRow}>
        <TextInput 
          style={styles.input} 
          value={inputText} 
          onChangeText={setInputText} 
          placeholder="Napisz anonimowo..." 
          placeholderTextColor="#666"
        />
        <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
          <Text style={styles.sendBtnText}>➔</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  channelHeader: { color: '#ff4757', textAlign: 'center', fontWeight: 'bold', padding: 10, backgroundColor: '#111' },
  msgBox: { padding: 10, borderRadius: 12, marginVertical: 5, maxWidth: '80%', marginHorizontal: 10 },
  myMsg: { alignSelf: 'flex-end', backgroundColor: '#1e90ff' },
  otherMsg: { alignSelf: 'flex-start', backgroundColor: '#333' },
  anonNick: { fontSize: 9, color: '#aaa', fontWeight: 'bold', marginBottom: 2 },
  msgText: { color: '#fff', fontSize: 14 },
  inputRow: { flexDirection: 'row', padding: 10, backgroundColor: '#111' },
  input: { flex: 1, color: '#fff', backgroundColor: '#222', padding: 10, borderRadius: 20 },
  sendBtn: { marginLeft: 10, backgroundColor: '#ff4757', width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center' },
  sendBtnText: { color: '#fff', fontSize: 20 }
});