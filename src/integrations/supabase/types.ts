export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      application_events: {
        Row: {
          application_id: string
          changed_at: string
          created_at: string
          id: string
          stage: Database["public"]["Enums"]["application_stage"]
          user_id: string
        }
        Insert: {
          application_id: string
          changed_at?: string
          created_at?: string
          id?: string
          stage: Database["public"]["Enums"]["application_stage"]
          user_id: string
        }
        Update: {
          application_id?: string
          changed_at?: string
          created_at?: string
          id?: string
          stage?: Database["public"]["Enums"]["application_stage"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          applied_at: string
          company: string
          created_at: string
          id: string
          job_id: string | null
          linkedin_easy_apply: boolean
          next_action: string | null
          next_action_at: string | null
          notes: string | null
          stage: Database["public"]["Enums"]["application_stage"]
          title: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          applied_at?: string
          company: string
          created_at?: string
          id?: string
          job_id?: string | null
          linkedin_easy_apply?: boolean
          next_action?: string | null
          next_action_at?: string | null
          notes?: string | null
          stage?: Database["public"]["Enums"]["application_stage"]
          title: string
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          applied_at?: string
          company?: string
          created_at?: string
          id?: string
          job_id?: string | null
          linkedin_easy_apply?: boolean
          next_action?: string | null
          next_action_at?: string | null
          notes?: string | null
          stage?: Database["public"]["Enums"]["application_stage"]
          title?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          company: string
          external_id: string
          first_seen_at: string
          id: string
          job_date: string
          last_seen_at: string
          location: string
          matched_groups: string[]
          matched_keywords: string[]
          notes: string | null
          source: string
          status: Database["public"]["Enums"]["job_status_kind"]
          status_updated_at: string
          title: string
          url: string
          user_id: string
        }
        Insert: {
          company?: string
          external_id: string
          first_seen_at?: string
          id?: string
          job_date?: string
          last_seen_at?: string
          location?: string
          matched_groups?: string[]
          matched_keywords?: string[]
          notes?: string | null
          source: string
          status?: Database["public"]["Enums"]["job_status_kind"]
          status_updated_at?: string
          title?: string
          url?: string
          user_id: string
        }
        Update: {
          company?: string
          external_id?: string
          first_seen_at?: string
          id?: string
          job_date?: string
          last_seen_at?: string
          location?: string
          matched_groups?: string[]
          matched_keywords?: string[]
          notes?: string | null
          source?: string
          status?: Database["public"]["Enums"]["job_status_kind"]
          status_updated_at?: string
          title?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      keyword_config: {
        Row: {
          config: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      manual_companies: {
        Row: {
          created_at: string
          id: string
          last_checked_at: string | null
          name: string
          notes: string | null
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_checked_at?: string | null
          name: string
          notes?: string | null
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_checked_at?: string | null
          name?: string
          notes?: string | null
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json
          id: string
          kind: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          kind: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      scan_runs: {
        Row: {
          errors: Json
          fetched_count: number
          finished_at: string | null
          id: string
          matched_count: number
          new_count: number
          source_counts: Json
          started_at: string
          triggered_by: string
          user_id: string
        }
        Insert: {
          errors?: Json
          fetched_count?: number
          finished_at?: string | null
          id?: string
          matched_count?: number
          new_count?: number
          source_counts?: Json
          started_at?: string
          triggered_by?: string
          user_id: string
        }
        Update: {
          errors?: Json
          fetched_count?: number
          finished_at?: string | null
          id?: string
          matched_count?: number
          new_count?: number
          source_counts?: Json
          started_at?: string
          triggered_by?: string
          user_id?: string
        }
        Relationships: []
      }
      scan_schedules: {
        Row: {
          created_at: string
          enabled: boolean
          frequency: string
          last_run_at: string | null
          next_run_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          frequency?: string
          last_run_at?: string | null
          next_run_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          frequency?: string
          last_run_at?: string | null
          next_run_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sources: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          name: string
          slug: string
          type: Database["public"]["Enums"]["source_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          name: string
          slug: string
          type: Database["public"]["Enums"]["source_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string
          slug?: string
          type?: Database["public"]["Enums"]["source_type"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      application_stage:
        | "applied"
        | "no_response"
        | "screen"
        | "interview"
        | "offer"
        | "rejected"
        | "withdrawn"
      job_status_kind:
        | "new"
        | "interested"
        | "applied"
        | "dismissed"
        | "archived"
      source_type:
        | "greenhouse"
        | "ashby"
        | "lever"
        | "doist"
        | "remotive"
        | "weworkremotely"
        | "workingnomads"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      application_stage: [
        "applied",
        "no_response",
        "screen",
        "interview",
        "offer",
        "rejected",
        "withdrawn",
      ],
      job_status_kind: [
        "new",
        "interested",
        "applied",
        "dismissed",
        "archived",
      ],
      source_type: [
        "greenhouse",
        "ashby",
        "lever",
        "doist",
        "remotive",
        "weworkremotely",
        "workingnomads",
      ],
    },
  },
} as const
