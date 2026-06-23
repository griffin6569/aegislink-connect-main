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
      ai_analyses: {
        Row: {
          analysis_type: string
          confidence: number | null
          created_at: string
          id: string
          incident_id: string
          model_used: string | null
          result: Json
        }
        Insert: {
          analysis_type: string
          confidence?: number | null
          created_at?: string
          id?: string
          incident_id: string
          model_used?: string | null
          result: Json
        }
        Update: {
          analysis_type?: string
          confidence?: number | null
          created_at?: string
          id?: string
          incident_id?: string
          model_used?: string | null
          result?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_analyses_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      client_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          read_at: string | null
          recipient_user_id: string
          sender_user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_user_id: string
          sender_user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_user_id?: string
          sender_user_id?: string
        }
        Relationships: []
      }
      evidence: {
        Row: {
          created_at: string
          file_name: string | null
          file_size: number | null
          file_type: string
          file_url: string
          id: string
          metadata: Json | null
          report_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          file_type: string
          file_url: string
          id?: string
          metadata?: Json | null
          report_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          file_type?: string
          file_url?: string
          id?: string
          metadata?: Json | null
          report_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          anonymous: boolean
          category: Database["public"]["Enums"]["incident_category"]
          created_at: string
          description: string
          detected_lat: number | null
          detected_lng: number | null
          display_id: string
          id: string
          location_address: string | null
          location_confidence: number | null
          location_source: string | null
          report_origin: string
          severity: Database["public"]["Enums"]["severity_level"]
          source_platform: string | null
          source_publisher: string | null
          source_url: string | null
          source_verification_status: string
          status: Database["public"]["Enums"]["incident_status"]
          subcategory: string
          submitted_lat: number | null
          submitted_lng: number | null
          updated_at: string
          user_id: string | null
          verified_lat: number | null
          verified_lng: number | null
        }
        Insert: {
          anonymous?: boolean
          category: Database["public"]["Enums"]["incident_category"]
          created_at?: string
          description: string
          detected_lat?: number | null
          detected_lng?: number | null
          display_id?: string
          id?: string
          location_address?: string | null
          location_confidence?: number | null
          location_source?: string | null
          report_origin?: string
          severity?: Database["public"]["Enums"]["severity_level"]
          source_platform?: string | null
          source_publisher?: string | null
          source_url?: string | null
          source_verification_status?: string
          status?: Database["public"]["Enums"]["incident_status"]
          subcategory: string
          submitted_lat?: number | null
          submitted_lng?: number | null
          updated_at?: string
          user_id?: string | null
          verified_lat?: number | null
          verified_lng?: number | null
        }
        Update: {
          anonymous?: boolean
          category?: Database["public"]["Enums"]["incident_category"]
          created_at?: string
          description?: string
          detected_lat?: number | null
          detected_lng?: number | null
          display_id?: string
          id?: string
          location_address?: string | null
          location_confidence?: number | null
          location_source?: string | null
          report_origin?: string
          severity?: Database["public"]["Enums"]["severity_level"]
          source_platform?: string | null
          source_publisher?: string | null
          source_url?: string | null
          source_verification_status?: string
          status?: Database["public"]["Enums"]["incident_status"]
          subcategory?: string
          submitted_lat?: number | null
          submitted_lng?: number | null
          updated_at?: string
          user_id?: string | null
          verified_lat?: number | null
          verified_lng?: number | null
        }
        Relationships: []
      }
      mesh_messages: {
        Row: {
          created_at: string
          expiry_time: string
          id: string
          message_id: string
          payload: Json
          receiver_device_id: string | null
          relay_count: number
          relay_status: Database["public"]["Enums"]["relay_status"]
          sender_device_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          expiry_time?: string
          id?: string
          message_id: string
          payload: Json
          receiver_device_id?: string | null
          relay_count?: number
          relay_status?: Database["public"]["Enums"]["relay_status"]
          sender_device_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          expiry_time?: string
          id?: string
          message_id?: string
          payload?: Json
          receiver_device_id?: string | null
          relay_count?: number
          relay_status?: Database["public"]["Enums"]["relay_status"]
          sender_device_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sync_queue: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          payload: Json
          retries: number
          sync_status: Database["public"]["Enums"]["sync_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          payload: Json
          retries?: number
          sync_status?: Database["public"]["Enums"]["sync_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          payload?: Json
          retries?: number
          sync_status?: Database["public"]["Enums"]["sync_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "authority"
      incident_category:
        | "crime"
        | "safety_hazard"
        | "emergency"
        | "community_violation"
      incident_status:
        | "pending"
        | "acknowledged"
        | "investigating"
        | "resolved"
        | "closed"
      relay_status: "pending" | "relayed" | "delivered"
      severity_level: "low" | "medium" | "high" | "critical"
      sync_status: "pending" | "syncing" | "synced" | "failed"
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
      app_role: ["admin", "moderator", "user", "authority"],
      incident_category: [
        "crime",
        "safety_hazard",
        "emergency",
        "community_violation",
      ],
      incident_status: [
        "pending",
        "acknowledged",
        "investigating",
        "resolved",
        "closed",
      ],
      relay_status: ["pending", "relayed", "delivered"],
      severity_level: ["low", "medium", "high", "critical"],
      sync_status: ["pending", "syncing", "synced", "failed"],
    },
  },
} as const
