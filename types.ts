// types.ts
export type UserRole = 'gracz' | 'agent' | 'impostor' | 'detektyw' | 'organizator';
export type TaskType = 'glowne' | 'sidequest' | 'special_event';

export interface Profile {
  id: string;
  imie_pseudonim: string;
  login?: string;
  rola: UserRole;
  team_id?: string;
  is_leader: boolean;
  latitude?: number;
  longitude?: number;
  haslo: string;
}

export interface Team {
  id: string;
  nazwa: string;
  kod_dolaczenia: string;
  punkty: number;
  aktywny_zestaw_id?: string;
  target_main_tasks: number;
  latitude?: number;
  longitude?: number;
}

export interface Task {
  id: string;
  tytul: string;
  opis: string;
  miejsce_opis: string;
  typ: TaskType;
  zestaw_id?: string;
  punkty_bazowe: number;
  kara_za_odrzucenie?: number;
  latitude?: number;
  longitude?: number;
  promien_metry: number;
  gate_5_min?: number;
  gate_4_min?: number;
  gate_3_min?: number;
  gate_2_min?: number;
  gate_1_min?: number;
}

export interface TeamTask {
  id: string;
  team_id: string;
  task_id: string;
  status: 'aktywne' | 'w_toku' | 'do_oceny' | 'zaakceptowane' | 'odrzucone' | 'pominiete';
  rozpoczecie_zadania?: string;
  przeslano_zadanie?: string;
  suma_pauzy_ms: number;
  ostatnia_pauza_start?: string;
  odpowiedz_tekst?: string;
  odpowiedz_foto_url?: string;
  przyznane_punkty: number;
}