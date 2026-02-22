import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator
} from 'react-native';
import { supabase } from '@/supabase';

// Generuj stały, anonimowy pseudonim na podstawie UUID
function anonNick(senderId: string, myId: string): string {
  if (senderId === myId) return 'TY';
  // Bierzemy fragment UUID i mapujemy na przyjazny pseudonim
  const part = senderId.replace(/-/g, '').slice(0, 4).toUpperCase();
  return `AGENT_${part}`;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Etykiety i kolory kanałów
const CHANNEL_META: Record<string, { label: string; color: string; icon: string }> = {
  impostor: { label: 'IMPOSTOR', color: '#8E44AD', icon: '🎭' },
  detektyw: { label: 'DETEKTYW', color: '#E67E22', icon: '🔍' },
  agenci:   { label: 'AGENCI',   color: '#2C3E50', icon: '🕶️' },
};

interface Props {
  channel: string;
  userProfile: any;
}

export default function GroupChat({ channel, userProfile }: Props) {
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const flatRef = useRef<FlatList>(null);

  const meta = CHANNEL_META[channel] ?? { label: channel.toUpperCase(), color: '#ff4757', icon: '💬' };

  useEffect(() => {
    fetchMessages();

    const sub = supabase
      .channel(`groupchat_${channel}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `channel=eq.${channel}`,
        },
        (payload) => {
          setMessages((prev) => [payload.new as any, ...prev]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [channel]);

  const fetchMessages = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('channel', channel)
      .order('created_at', { ascending: false })
      .limit(80);
    if (data) setMessages(data);
    setLoading(false);
  };

  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text) return;
    setSending(true);
    setInputText('');
    await supabase.from('chat_messages').insert([{
      channel,
      sender_id: userProfile.id,
      text,
    }]);
    setSending(false);
  };

  const renderItem = ({ item }: { item: any }) => {
    const isMine = item.sender_id === userProfile.id;
    const nick = anonNick(item.sender_id, userProfile.id);
    return (
      <View style={[styles.msgWrapper, isMine ? styles.myWrapper : styles.theirWrapper]}>
        {!isMine && (
          <Text style={[styles.nick, { color: meta.color }]}>{nick}</Text>
        )}
        <View style={[styles.bubble, isMine ? styles.myBubble : styles.theirBubble]}>
          <Text style={styles.msgText}>{item.text}</Text>
        </View>
        <Text style={styles.timeText}>{fmtTime(item.created_at)}</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      style={styles.container}
    >
      {/* ── NAGŁÓWEK ── */}
      <View style={[styles.header, { borderBottomColor: meta.color }]}>
        <Text style={styles.headerIcon}>{meta.icon}</Text>
        <View>
          <Text style={[styles.headerTitle, { color: meta.color }]}>{meta.label}</Text>
          <Text style={styles.headerSub}>Kanał szyfrowany • Anonimowy</Text>
        </View>
      </View>

      {/* ── WIADOMOŚCI ── */}
      {loading ? (
        <ActivityIndicator color={meta.color} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          ref={flatRef}
          inverted
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 15 }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Brak wiadomości. Zacznij rozmowę!</Text>
          }
        />
      )}

      {/* ── INPUT ── */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Wiadomość szyfrowana..."
          placeholderTextColor="#444"
          multiline
          maxLength={500}
          returnKeyType="send"
          onSubmitEditing={sendMessage}
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: meta.color }, (!inputText.trim() || sending) && styles.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={!inputText.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.sendBtnIcon}>➔</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#0a0a0a',
    borderBottomWidth: 2,
    gap: 12,
  },
  headerIcon: { fontSize: 28 },
  headerTitle: { fontSize: 16, fontWeight: 'bold', letterSpacing: 2 },
  headerSub: { color: '#333', fontSize: 9, fontWeight: 'bold', marginTop: 2 },

  emptyText: { color: '#333', textAlign: 'center', marginTop: 40, fontStyle: 'italic' },

  msgWrapper: { marginBottom: 10, maxWidth: '80%' },
  myWrapper: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  theirWrapper: { alignSelf: 'flex-start', alignItems: 'flex-start' },

  nick: { fontSize: 9, fontWeight: 'bold', marginBottom: 3, letterSpacing: 1 },
  bubble: { padding: 12, borderRadius: 16 },
  myBubble: { backgroundColor: '#1a1a3a', borderBottomRightRadius: 4 },
  theirBubble: { backgroundColor: '#1a1a1a', borderBottomLeftRadius: 4 },
  msgText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  timeText: { color: '#333', fontSize: 9, marginTop: 3 },

  inputBar: {
    flexDirection: 'row',
    padding: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    backgroundColor: '#0a0a0a',
    borderTopWidth: 1,
    borderTopColor: '#111',
    gap: 10,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    color: '#fff',
    backgroundColor: '#111',
    padding: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#222',
    maxHeight: 100,
    fontSize: 14,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnIcon: { color: '#fff', fontSize: 20 },
});
