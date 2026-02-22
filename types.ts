// types.ts
export type UserRole = 'gracz' | 'agent' | 'impostor' | 'detektyw' | 'organizator';
export type TaskType = 'glowne' | 'sidequest' | 'special_event';
export type TeamTaskStatus =
  | 'aktywne'
  | 'w_toku'
  | 'do_oceny'
  | 'zaakceptowane'
  | 'odrzucone'
  | 'pominiete';

export interface Profile {
  id: string;
  imie_pseudonim: string;
  login?: string;
  rola: UserRole;
  rola_w_grze?: string;
  team_id?: string | null;
  is_leader: boolean;
  haslo?: string;
  // GPS gracza (opcjonalnie aktualizowane przez LocationTracker)
  latitude?: number;
  longitude?: number;
}

export interface Team {
  id: string;
  nazwa: string;
  kod_dolaczenia: string;
  punkty: number;
  aktywny_zestaw_id?: string | null;
  target_main_tasks: number;
}

export interface Task {
  id: string;
  tytul: string;
  opis?: string;
  miejsce_opis?: string;
  typ: TaskType;
  zestaw_id?: string | null;
  punkty_bazowe: number;
  kara_za_pominiecie?: number;
  latitude?: number;
  longitude?: number;
  promien_metry: number;
  kolejnosc?: number;
  gate_5_min?: number | null;
  gate_4_min?: number | null;
  gate_3_min?: number | null;
  gate_2_min?: number | null;
  gate_1_min?: number | null;
  utworzono_w?: string;
}

export interface TeamTask {
  id: string;
  team_id: string;
  task_id: string;
  status: TeamTaskStatus;
  rozpoczecie_zadania?: string | null;
  przeslano_zadanie?: string | null;
  suma_pauzy_ms: number;
  ostatnia_pauza_start?: string | null;
  odpowiedz_tekst?: string | null;
  odpowiedz_foto_url?: string | null;
  dowod_url?: string | null;
  uwagi_sedziego?: string | null;
  przyznane_punkty: number;
  utworzono_w?: string;
}

export interface ChatMessage {
  id: string;
  channel: string;
  sender_id?: string;
  text: string;
  created_at: string;
}

export interface GlobalAlert {
  id: string;
  tresc: string;
  utworzono_w: string;
}

export interface GlobalMessage {
  id: string;
  tresc: string;
  autor: string;
  utworzono_w: string;
}
