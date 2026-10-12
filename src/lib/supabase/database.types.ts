export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      actual_points: {
        Row: {
          actual_points: number
          entered_at: string
          id: string
          is_seed: boolean
          player_id: string
          player_name: string
          prediction_id: string
        }
        Insert: {
          actual_points?: number
          entered_at?: string
          id?: string
          is_seed?: boolean
          player_id: string
          player_name: string
          prediction_id: string
        }
        Update: {
          actual_points?: number
          entered_at?: string
          id?: string
          is_seed?: boolean
          player_id?: string
          player_name?: string
          prediction_id?: string
        }
        Relationships: []
      }
      api_cache: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          id: string
          payload: Json
          source: string | null
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at: string
          id?: string
          payload: Json
          source?: string | null
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          id?: string
          payload?: Json
          source?: string | null
        }
        Relationships: []
      }
      insights: {
        Row: {
          applied_weight_version: number | null
          avg_residual: number
          bias_direction: string | null
          created_at: string
          detail: string | null
          gemini_explanation: string | null
          id: string
          mean_abs_error: number
          sample_size: number
          segment_type: string
          segment_value: string
          status: string
          suggested_weight_changes: Json | null
        }
        Insert: {
          applied_weight_version?: number | null
          avg_residual?: number
          bias_direction?: string | null
          created_at?: string
          detail?: string | null
          gemini_explanation?: string | null
          id?: string
          mean_abs_error?: number
          sample_size?: number
          segment_type: string
          segment_value: string
          status?: string
          suggested_weight_changes?: Json | null
        }
        Update: {
          applied_weight_version?: number | null
          avg_residual?: number
          bias_direction?: string | null
          created_at?: string
          detail?: string | null
          gemini_explanation?: string | null
          id?: string
          mean_abs_error?: number
          sample_size?: number
          segment_type?: string
          segment_value?: string
          status?: string
          suggested_weight_changes?: Json | null
        }
        Relationships: []
      }
      match_players: {
        Row: {
          batting_order: number | null
          created_at: string
          credits: number
          credits_estimated: boolean
          id: string
          in_announced_xi: boolean
          is_impact_sub: boolean
          match_id: string
          player_id: string
          role: string
          team: string
          team_short: string | null
        }
        Insert: {
          batting_order?: number | null
          created_at?: string
          credits?: number
          credits_estimated?: boolean
          id?: string
          in_announced_xi?: boolean
          is_impact_sub?: boolean
          match_id: string
          player_id: string
          role?: string
          team: string
          team_short?: string | null
        }
        Update: {
          batting_order?: number | null
          created_at?: string
          credits?: number
          credits_estimated?: boolean
          id?: string
          in_announced_xi?: boolean
          is_impact_sub?: boolean
          match_id?: string
          player_id?: string
          role?: string
          team?: string
          team_short?: string | null
        }
        Relationships: []
      }
      matches: {
        Row: {
          created_at: string
          external_id: string | null
          format: string
          has_squads: boolean
          id: string
          name: string
          raw: Json | null
          result_text: string | null
          series: string | null
          short_name: string | null
          start_time: string | null
          status: string
          team_a: string | null
          team_a_logo: string | null
          team_a_short: string | null
          team_b: string | null
          team_b_logo: string | null
          team_b_short: string | null
          toss_decision: string | null
          toss_winner: string | null
          updated_at: string
          venue: string | null
          venue_city: string | null
          venue_country: string | null
        }
        Insert: {
          created_at?: string
          external_id?: string | null
          format?: string
          has_squads?: boolean
          id?: string
          name: string
          raw?: Json | null
          result_text?: string | null
          series?: string | null
          short_name?: string | null
          start_time?: string | null
          status?: string
          team_a?: string | null
          team_a_logo?: string | null
          team_a_short?: string | null
          team_b?: string | null
          team_b_logo?: string | null
          team_b_short?: string | null
          toss_decision?: string | null
          toss_winner?: string | null
          updated_at?: string
          venue?: string | null
          venue_city?: string | null
          venue_country?: string | null
        }
        Update: {
          created_at?: string
          external_id?: string | null
          format?: string
          has_squads?: boolean
          id?: string
          name?: string
          raw?: Json | null
          result_text?: string | null
          series?: string | null
          short_name?: string | null
          start_time?: string | null
          status?: string
          team_a?: string | null
          team_a_logo?: string | null
          team_a_short?: string | null
          team_b?: string | null
          team_b_logo?: string | null
          team_b_short?: string | null
          toss_decision?: string | null
          toss_winner?: string | null
          updated_at?: string
          venue?: string | null
          venue_city?: string | null
          venue_country?: string | null
        }
        Relationships: []
      }
      players: {
        Row: {
          batting_style: string | null
          bowling_style: string | null
          country: string | null
          created_at: string
          external_id: string | null
          id: string
          name: string
          raw: Json | null
          role: string | null
        }
        Insert: {
          batting_style?: string | null
          bowling_style?: string | null
          country?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          name: string
          raw?: Json | null
          role?: string | null
        }
        Update: {
          batting_style?: string | null
          bowling_style?: string | null
          country?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          name?: string
          raw?: Json | null
          role?: string | null
        }
        Relationships: []
      }
      prediction_players: {
        Row: {
          base_score: number
          batting_order: number | null
          created_at: string
          credits: number
          gemini_adjustment: number
          id: string
          in_announced_xi: boolean
          is_captain: boolean
          is_vice_captain: boolean
          player_id: string
          player_name: string
          predicted_points: number
          predicted_points_effective: number
          prediction_id: string
          reason: string | null
          risk_flag: string | null
          role: string
          selected: boolean
          team: string | null
        }
        Insert: {
          base_score?: number
          batting_order?: number | null
          created_at?: string
          credits?: number
          gemini_adjustment?: number
          id?: string
          in_announced_xi?: boolean
          is_captain?: boolean
          is_vice_captain?: boolean
          player_id: string
          player_name: string
          predicted_points?: number
          predicted_points_effective?: number
          prediction_id: string
          reason?: string | null
          risk_flag?: string | null
          role: string
          selected?: boolean
          team?: string | null
        }
        Update: {
          base_score?: number
          batting_order?: number | null
          created_at?: string
          credits?: number
          gemini_adjustment?: number
          id?: string
          in_announced_xi?: boolean
          is_captain?: boolean
          is_vice_captain?: boolean
          player_id?: string
          player_name?: string
          predicted_points?: number
          predicted_points_effective?: number
          prediction_id?: string
          reason?: string | null
          risk_flag?: string | null
          role?: string
          selected?: boolean
          team?: string | null
        }
        Relationships: []
      }
      predictions: {
        Row: {
          captain_player_id: string | null
          created_at: string
          gemini_model: string | null
          gemini_reasoning: Json | null
          id: string
          is_seed: boolean
          match_id: string
          rule_mode: string
          team_split: string | null
          total_credits: number
          total_predicted_points: number
          updated_at: string
          used_grounding: boolean
          vice_captain_player_id: string | null
          weight_version: number
        }
        Insert: {
          captain_player_id?: string | null
          created_at?: string
          gemini_model?: string | null
          gemini_reasoning?: Json | null
          id?: string
          is_seed?: boolean
          match_id: string
          rule_mode?: string
          team_split?: string | null
          total_credits?: number
          total_predicted_points?: number
          updated_at?: string
          used_grounding?: boolean
          vice_captain_player_id?: string | null
          weight_version: number
        }
        Update: {
          captain_player_id?: string | null
          created_at?: string
          gemini_model?: string | null
          gemini_reasoning?: Json | null
          id?: string
          is_seed?: boolean
          match_id?: string
          rule_mode?: string
          team_split?: string | null
          total_credits?: number
          total_predicted_points?: number
          updated_at?: string
          used_grounding?: boolean
          vice_captain_player_id?: string | null
          weight_version?: number
        }
        Relationships: []
      }
      scoring_weights: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string
          rationale: string | null
          version: number
          weights: Json
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          rationale?: string | null
          version: number
          weights: Json
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          rationale?: string | null
          version?: number
          weights?: Json
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  T extends keyof DefaultSchema["Tables"],
> = DefaultSchema["Tables"][T]["Row"]

export type TablesInsert<
  T extends keyof DefaultSchema["Tables"],
> = DefaultSchema["Tables"][T]["Insert"]

export type TablesUpdate<
  T extends keyof DefaultSchema["Tables"],
> = DefaultSchema["Tables"][T]["Update"]
