import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '@/supabase';
import { Profile } from '@/types';

export default function GroupChat({ channel, userProfile }: { channel: string, userProfile: Profile }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');

  useEffect(() => {
    fetchMessages();
    const sub = supabase.channel(`chat_${channel}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel=eq.${channel}` }, 
      () => {
        // Odświeżamy listę, by zaciągnąć z bazy relacje profiles(imie_pseudonim) dla nowych wiadomości
        fetchMessages();
      })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [channel]);

  const fetchMessages = async () => {
    // Zapytanie, które pobiera powiązane imię użytkownika z tabeli profiles
    const { data } = await supabase.from('chat_messages')
      .select('*, profiles(imie_pseudonim)')
      .eq('channel', channel)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setMessages(data);
  };

  const sendMessage = async () => {
    if (!inputText.trim()) return;
    await supabase.from('chat_messages').insert([{ channel, sender_id: userProfile.id, text: inputText.trim() }]);
    setInputText('');
  };

  const getAnonNick = (item: any) => {
    // 1. Jeśli to Ty wysłałeś wiadomość
    if (item.sender_id === userProfile.id) {
        return userProfile.rola === 'organizator' ? "TY (ORGANIZATOR)" : "TY";
    }
    
    // 2. Jeśli jesteś Organizatorem, widzisz prawdziwe imiona innych graczy
    if (userProfile.rola === 'organizator') {
      return item.profiles?.imie_pseudonim ? item.profiles.imie_pseudonim.toUpperCase() : 'NIEZNANY';
    }
    
    // 3. Jeśli pisze do Ciebie Organizator, widzisz go jako "DOWÓDZTWO" (by rozpoznać, że to admin)
    // UWAGA: Zapytanie SQL nie zwraca pola "rola" powiązanego użytkownika, więc opieramy to na ew. logice.
    // Jeśli nie chcesz, aby admin się wyróżniał, pomiń to. Zostawiamy pełną anonimowość opartą na Hashu dla innych graczy.
    const hash = item.sender_id.split('-')[0].toUpperCase(); 
    return `OPERATOR_${hash}`; 
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0} 
      style={styles.container}
    >
      <Text style={styles.channelHeader}>TAJNY KANAŁ FRAKCJI: {channel.toUpperCase()}</Text>
      <FlatList
        inverted
        data={messages}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const isMe = item.sender_id === userProfile.id;
          return (
            <View style={[styles.msgBox, isMe ? styles.myMsg : styles.otherMsg]}>
              <Text style={[styles.anonNick, isMe && { color: '#fff', opacity: 0.8 }]}>
                {getAnonNick(item)}
              </Text>
              <Text style={styles.msgText}>{item.text}</Text>
            </View>
          );
        }}
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
  channelHeader: { color: '#fff', textAlign: 'center', fontWeight: 'bold', padding: 10, backgroundColor: '#111', fontSize: 12, letterSpacing: 2, borderBottomWidth: 1, borderBottomColor: '#222' },
  msgBox: { padding: 10, borderRadius: 15, marginVertical: 5, maxWidth: '80%', marginHorizontal: 10 },
  myMsg: { alignSelf: 'flex-end', backgroundColor: '#3742fa', borderBottomRightRadius: 2 },
  otherMsg: { alignSelf: 'flex-start', backgroundColor: '#222', borderBottomLeftRadius: 2 },
  anonNick: { fontSize: 9, color: '#ff4757', fontWeight: 'bold', marginBottom: 4, letterSpacing: 1 },
  msgText: { color: '#fff', fontSize: 14 },
  inputRow: { flexDirection: 'row', padding: 15, backgroundColor: '#0a0a0a', borderTopWidth: 1, borderTopColor: '#111' },
  input: { flex: 1, color: '#fff', backgroundColor: '#1a1a1a', padding: 12, borderRadius: 20, borderWidth: 1, borderColor: '#333' },
  sendBtn: { marginLeft: 10, backgroundColor: '#ff4757', width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center' },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }
});