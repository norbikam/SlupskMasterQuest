import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '@/supabase';
import { Profile } from '@/types';

// NAPRAWA BŁĘDU: Dodanie definicji Props
interface ChatProps {
  userProfile: Profile;
}

export default function GlobalChat({ userProfile }: ChatProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');

  useEffect(() => {
    fetchMessages();
    const subscription = supabase
      .channel('public:chat_messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => {
        setMessages(prev => [payload.new, ...prev]);
      })
      .subscribe();

    return () => { supabase.removeChannel(subscription); };
  }, []);

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('chat_messages')
      .select('*, profiles(imie_pseudonim)')
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setMessages(data);
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    await supabase.from('chat_messages').insert([
      { text: newMessage, sender_id: userProfile.id, channel: 'global' }
    ]);
    setNewMessage('');
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <FlatList
        data={messages}
        inverted
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={[styles.msgBox, item.sender_id === userProfile.id && styles.myMsg]}>
            <Text style={styles.sender}>{item.profiles?.imie_pseudonim || 'Anonim'}</Text>
            <Text style={styles.msgText}>{item.text}</Text>
          </View>
        )}
      />
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={newMessage}
          onChangeText={setNewMessage}
          placeholder="Napisz wiadomość..."
          placeholderTextColor="#666"
        />
        <TouchableOpacity onPress={sendMessage} style={styles.sendBtn}>
          <Text style={styles.sendBtnText}>WYŚLIJ</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  inputRow: { flexDirection: 'row', padding: 10, borderTopWidth: 1, borderColor: '#222' },
  input: { flex: 1, backgroundColor: '#111', color: '#fff', padding: 12, borderRadius: 10 },
  sendBtn: { marginLeft: 10, justifyContent: 'center', backgroundColor: '#ff4757', paddingHorizontal: 15, borderRadius: 10 },
  sendBtnText: { color: '#fff', fontWeight: 'bold' },
  msgBox: { backgroundColor: '#222', padding: 10, margin: 5, borderRadius: 10, alignSelf: 'flex-start', maxWidth: '80%' },
  myMsg: { alignSelf: 'flex-end', backgroundColor: '#3742fa' },
  sender: { color: '#ff4757', fontSize: 10, fontWeight: 'bold', marginBottom: 2 },
  msgText: { color: '#fff' }
});