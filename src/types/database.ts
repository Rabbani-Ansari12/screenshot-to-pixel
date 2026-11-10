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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_processing_records: {
        Row: {
          attempts: number
          business_id: string
          corrections: Json
          created_at: string
          created_by: string | null
          document_id: string
          error: string | null
          extracted: Json | null
          field_confidences: Json | null
          id: string
          match_result: Json | null
          model: string
          overall_confidence: number | null
          processed_at: string | null
          raw_response: Json | null
          status: Database["public"]["Enums"]["ai_status"]
          updated_at: string
          updated_by: string | null
          usage: Json | null
        }
        Insert: {
          attempts?: number
          business_id?: string
          corrections?: Json
          created_at?: string
          created_by?: string | null
          document_id: string
          error?: string | null
          extracted?: Json | null
          field_confidences?: Json | null
          id?: string
          match_result?: Json | null
          model: string
          overall_confidence?: number | null
          processed_at?: string | null
          raw_response?: Json | null
          status?: Database["public"]["Enums"]["ai_status"]
          updated_at?: string
          updated_by?: string | null
          usage?: Json | null
        }
        Update: {
          attempts?: number
          business_id?: string
          corrections?: Json
          created_at?: string
          created_by?: string | null
          document_id?: string
          error?: string | null
          extracted?: Json | null
          field_confidences?: Json | null
          id?: string
          match_result?: Json | null
          model?: string
          overall_confidence?: number | null
          processed_at?: string | null
          raw_response?: Json | null
          status?: Database["public"]["Enums"]["ai_status"]
          updated_at?: string
          updated_by?: string | null
          usage?: Json | null
        }
        Relationships: []
      }
      ai_usage_daily: {
        Row: {
          business_id: string
          calls: number
          day: string
          output_tokens: number
          prompt_tokens: number
        }
        Insert: {
          business_id: string
          calls?: number
          day: string
          output_tokens?: number
          prompt_tokens?: number
        }
        Update: {
          business_id?: string
          calls?: number
          day?: string
          output_tokens?: number
          prompt_tokens?: number
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          ai_daily_call_cap: number
          authoritative_weight: Database["public"]["Enums"]["weight_record_type"]
          auto_process_confidence_threshold: number
          business_id: string
          business_profile: Json
          created_at: string
          created_by: string | null
          default_shortage_tolerance: number
          enabled_units: Database["public"]["Enums"]["material_unit"][]
          gst_config: Json
          id: string
          invoice_number_width: number
          invoice_prefix: string
          match_margin: number
          match_threshold: number
          match_weights: Json
          match_window_hours: number
          net_weight_tolerance: number
          next_invoice_number: number
          notification_preferences: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ai_daily_call_cap?: number
          authoritative_weight?: Database["public"]["Enums"]["weight_record_type"]
          auto_process_confidence_threshold?: number
          business_id?: string
          business_profile?: Json
          created_at?: string
          created_by?: string | null
          default_shortage_tolerance?: number
          enabled_units?: Database["public"]["Enums"]["material_unit"][]
          gst_config?: Json
          id?: string
          invoice_number_width?: number
          invoice_prefix?: string
          match_margin?: number
          match_threshold?: number
          match_weights?: Json
          match_window_hours?: number
          net_weight_tolerance?: number
          next_invoice_number?: number
          notification_preferences?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ai_daily_call_cap?: number
          authoritative_weight?: Database["public"]["Enums"]["weight_record_type"]
          auto_process_confidence_threshold?: number
          business_id?: string
          business_profile?: Json
          created_at?: string
          created_by?: string | null
          default_shortage_tolerance?: number
          enabled_units?: Database["public"]["Enums"]["material_unit"][]
          gst_config?: Json
          id?: string
          invoice_number_width?: number
          invoice_prefix?: string
          match_margin?: number
          match_threshold?: number
          match_weights?: Json
          match_window_hours?: number
          net_weight_tolerance?: number
          next_invoice_number?: number
          notification_preferences?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          business_id: string
          changed_at: string
          changed_by: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          reason: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          business_id: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          reason?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          business_id?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          reason?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      businesses: {
        Row: {
          created_at: string
          created_by: string | null
          gstin: string | null
          id: string
          legal_name: string | null
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          gstin?: string | null
          id?: string
          legal_name?: string | null
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          gstin?: string | null
          id?: string
          legal_name?: string | null
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      construction_sites: {
        Row: {
          address: string | null
          business_id: string
          city: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          business_id?: string
          city?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          business_id?: string
          city?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      customer_invoices: {
        Row: {
          additional_charges: number
          business_id: string
          created_at: string
          created_by: string | null
          customer_id: string
          deleted_at: string | null
          due_date: string | null
          gst_mode: Database["public"]["Enums"]["gst_mode"]
          id: string
          invoice_date: string
          invoice_number: string
          notes: string | null
          order_id: string
          recon_status: Database["public"]["Enums"]["recon_status"]
          site_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
          updated_by: string | null
          verification_flags: string[]
        }
        Insert: {
          additional_charges?: number
          business_id?: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          deleted_at?: string | null
          due_date?: string | null
          gst_mode?: Database["public"]["Enums"]["gst_mode"]
          id?: string
          invoice_date?: string
          invoice_number: string
          notes?: string | null
          order_id: string
          recon_status?: Database["public"]["Enums"]["recon_status"]
          site_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
          verification_flags?: string[]
        }
        Update: {
          additional_charges?: number
          business_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          deleted_at?: string | null
          due_date?: string | null
          gst_mode?: Database["public"]["Enums"]["gst_mode"]
          id?: string
          invoice_date?: string
          invoice_number?: string
          notes?: string | null
          order_id?: string
          recon_status?: Database["public"]["Enums"]["recon_status"]
          site_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
          verification_flags?: string[]
        }
        Relationships: []
      }
      customer_orders: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          customer_id: string
          customer_reference: string | null
          deleted_at: string | null
          expected_delivery: string | null
          id: string
          notes: string | null
          order_code: string
          order_date: string
          site_id: string
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          customer_reference?: string | null
          deleted_at?: string | null
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          order_code?: string
          order_date?: string
          site_id: string
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          customer_reference?: string | null
          deleted_at?: string | null
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          order_code?: string
          order_date?: string
          site_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          billing_address: string | null
          business_id: string
          city: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          credit_days: number
          customer_type: string | null
          deleted_at: string | null
          email: string | null
          gstin: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          state: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          billing_address?: string | null
          business_id?: string
          city?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          credit_days?: number
          customer_type?: string | null
          deleted_at?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          state?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          billing_address?: string | null
          business_id?: string
          city?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          credit_days?: number
          customer_type?: string | null
          deleted_at?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          state?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      delivery_records: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          delivered_at: string | null
          delivered_net: number | null
          delivery_weight_id: string | null
          id: string
          investigated_at: string | null
          investigated_by: string | null
          investigation_notes: string | null
          investigation_outcome: Database["public"]["Enums"]["investigation_outcome"] | null
          loading_net: number | null
          loading_weight_id: string | null
          quantity_difference: number | null
          received_by_name: string | null
          site_id: string | null
          tolerance: number
          tolerance_status: Database["public"]["Enums"]["tolerance_status"] | null
          trip_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivered_net?: number | null
          delivery_weight_id?: string | null
          id?: string
          investigated_at?: string | null
          investigated_by?: string | null
          investigation_notes?: string | null
          investigation_outcome?: Database["public"]["Enums"]["investigation_outcome"] | null
          loading_net?: number | null
          loading_weight_id?: string | null
          quantity_difference?: never
          received_by_name?: string | null
          site_id?: string | null
          tolerance?: number
          tolerance_status?: never
          trip_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivered_net?: number | null
          delivery_weight_id?: string | null
          id?: string
          investigated_at?: string | null
          investigated_by?: string | null
          investigation_notes?: string | null
          investigation_outcome?: Database["public"]["Enums"]["investigation_outcome"] | null
          loading_net?: number | null
          loading_weight_id?: string | null
          quantity_difference?: never
          received_by_name?: string | null
          site_id?: string | null
          tolerance?: number
          tolerance_status?: never
          trip_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      document_corrections: {
        Row: {
          business_id: string
          corrected_at: string
          corrected_by: string | null
          corrected_value: string | null
          created_at: string
          document_id: string
          field_key: string
          id: string
          original_value: string | null
          reason: string
        }
        Insert: {
          business_id: string
          corrected_at?: string
          corrected_by?: string | null
          corrected_value?: string | null
          created_at?: string
          document_id: string
          field_key: string
          id?: string
          original_value?: string | null
          reason: string
        }
        Update: {
          business_id?: string
          corrected_at?: string
          corrected_by?: string | null
          corrected_value?: string | null
          created_at?: string
          document_id?: string
          field_key?: string
          id?: string
          original_value?: string | null
          reason?: string
        }
        Relationships: []
      }
      document_jobs: {
        Row: {
          attempts: number
          business_id: string
          created_at: string
          document_id: string
          id: string
          last_error: string | null
          locked_at: string | null
          max_attempts: number
          next_run_at: string
          status: Database["public"]["Enums"]["document_job_status"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          business_id: string
          created_at?: string
          document_id: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          max_attempts?: number
          next_run_at?: string
          status?: Database["public"]["Enums"]["document_job_status"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          business_id?: string
          created_at?: string
          document_id?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          max_attempts?: number
          next_run_at?: string
          status?: Database["public"]["Enums"]["document_job_status"]
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          delivery_record_id: string | null
          doc_type: Database["public"]["Enums"]["document_type"]
          document_type_hint: string | null
          duplicate_of_document_id: string | null
          extracted: Json | null
          file_name: string | null
          id: string
          invoice_id: string | null
          mime_type: string | null
          notes: string | null
          overall_confidence: number | null
          page_count: number | null
          payment_id: string | null
          processed_at: string | null
          provider_bill_id: string | null
          purchase_id: string | null
          received_at: string
          record_type: Database["public"]["Enums"]["weight_record_type"] | null
          review_detail: Json | null
          review_reason: Database["public"]["Enums"]["review_reason"] | null
          sha256: string
          size_bytes: number | null
          source: Database["public"]["Enums"]["document_intake_source"]
          status: Database["public"]["Enums"]["document_status"]
          storage_path: string
          transporter_bill_id: string | null
          trip_hint_id: string | null
          trip_id: string | null
          updated_at: string
          updated_by: string | null
          uploaded_by: string | null
          uploaded_by_label: string | null
        }
        Insert: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          delivery_record_id?: string | null
          doc_type?: Database["public"]["Enums"]["document_type"]
          document_type_hint?: string | null
          duplicate_of_document_id?: string | null
          extracted?: Json | null
          file_name?: string | null
          id?: string
          invoice_id?: string | null
          mime_type?: string | null
          notes?: string | null
          overall_confidence?: number | null
          page_count?: number | null
          payment_id?: string | null
          processed_at?: string | null
          provider_bill_id?: string | null
          purchase_id?: string | null
          received_at?: string
          record_type?: Database["public"]["Enums"]["weight_record_type"] | null
          review_detail?: Json | null
          review_reason?: Database["public"]["Enums"]["review_reason"] | null
          sha256: string
          size_bytes?: number | null
          source?: Database["public"]["Enums"]["document_intake_source"]
          status?: Database["public"]["Enums"]["document_status"]
          storage_path: string
          transporter_bill_id?: string | null
          trip_hint_id?: string | null
          trip_id?: string | null
          updated_at?: string
          updated_by?: string | null
          uploaded_by?: string | null
          uploaded_by_label?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          delivery_record_id?: string | null
          doc_type?: Database["public"]["Enums"]["document_type"]
          document_type_hint?: string | null
          duplicate_of_document_id?: string | null
          extracted?: Json | null
          file_name?: string | null
          id?: string
          invoice_id?: string | null
          mime_type?: string | null
          notes?: string | null
          overall_confidence?: number | null
          page_count?: number | null
          payment_id?: string | null
          processed_at?: string | null
          provider_bill_id?: string | null
          purchase_id?: string | null
          received_at?: string
          record_type?: Database["public"]["Enums"]["weight_record_type"] | null
          review_detail?: Json | null
          review_reason?: Database["public"]["Enums"]["review_reason"] | null
          sha256?: string
          size_bytes?: number | null
          source?: Database["public"]["Enums"]["document_intake_source"]
          status?: Database["public"]["Enums"]["document_status"]
          storage_path?: string
          transporter_bill_id?: string | null
          trip_hint_id?: string | null
          trip_id?: string | null
          updated_at?: string
          updated_by?: string | null
          uploaded_by?: string | null
          uploaded_by_label?: string | null
        }
        Relationships: []
      }
      drivers: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          full_name: string
          id: string
          is_active: boolean
          license_number: string | null
          phone: string | null
          transporter_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          license_number?: string | null
          phone?: string | null
          transporter_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          license_number?: string | null
          phone?: string | null
          transporter_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      employees: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          designation: string | null
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          joined_on: string | null
          phone: string | null
          profile_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          designation?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          joined_on?: string | null
          phone?: string | null
          profile_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          designation?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          joined_on?: string | null
          phone?: string | null
          profile_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          business_id: string
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          expense_date: string
          id: string
          mode: Database["public"]["Enums"]["payment_mode"]
          order_id: string | null
          paid_to: string | null
          trip_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          business_id?: string
          category: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description: string
          expense_date?: string
          id?: string
          mode?: Database["public"]["Enums"]["payment_mode"]
          order_id?: string | null
          paid_to?: string | null
          trip_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          business_id?: string
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          expense_date?: string
          id?: string
          mode?: Database["public"]["Enums"]["payment_mode"]
          order_id?: string | null
          paid_to?: string | null
          trip_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          amount: number | null
          business_id: string
          created_at: string
          created_by: string | null
          delivery_record_id: string | null
          description: string | null
          gst_rate: number
          id: string
          invoice_id: string
          material_id: string
          quantity: number
          rate: number
          trip_id: string | null
          unit: Database["public"]["Enums"]["material_unit"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount?: never
          business_id?: string
          created_at?: string
          created_by?: string | null
          delivery_record_id?: string | null
          description?: string | null
          gst_rate?: number
          id?: string
          invoice_id: string
          material_id: string
          quantity: number
          rate: number
          trip_id?: string | null
          unit: Database["public"]["Enums"]["material_unit"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: never
          business_id?: string
          created_at?: string
          created_by?: string | null
          delivery_record_id?: string | null
          description?: string | null
          gst_rate?: number
          id?: string
          invoice_id?: string
          material_id?: string
          quantity?: number
          rate?: number
          trip_id?: string | null
          unit?: Database["public"]["Enums"]["material_unit"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      material_providers: {
        Row: {
          business_id: string
          city: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          gstin: string | null
          id: string
          is_active: boolean
          name: string
          payment_terms_days: number
          phone: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_id?: string
          city?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          name: string
          payment_terms_days?: number
          phone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_id?: string
          city?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          name?: string
          payment_terms_days?: number
          phone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      material_rates: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          effective_from: string
          id: string
          material_id: string
          notes: string | null
          provider_id: string | null
          rate: number
          rate_type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          effective_from: string
          id?: string
          material_id: string
          notes?: string | null
          provider_id?: string | null
          rate: number
          rate_type: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          material_id?: string
          notes?: string | null
          provider_id?: string | null
          rate?: number
          rate_type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      materials: {
        Row: {
          business_id: string
          category: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          gst_rate: number
          hsn_code: string | null
          id: string
          is_active: boolean
          name: string
          purchase_rate: number | null
          selling_rate: number | null
          shortage_tolerance: number
          unit: Database["public"]["Enums"]["material_unit"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_id?: string
          category: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          gst_rate?: number
          hsn_code?: string | null
          id?: string
          is_active?: boolean
          name: string
          purchase_rate?: number | null
          selling_rate?: number | null
          shortage_tolerance?: number
          unit: Database["public"]["Enums"]["material_unit"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_id?: string
          category?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          gst_rate?: number
          hsn_code?: string | null
          id?: string
          is_active?: boolean
          name?: string
          purchase_rate?: number | null
          selling_rate?: number | null
          shortage_tolerance?: number
          unit?: Database["public"]["Enums"]["material_unit"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          business_id: string
          created_at: string
          detail: string | null
          document_id: string | null
          href: string | null
          id: string
          kind: string
          read_by: string[]
          required_permission: Database["public"]["Enums"]["permission_key"] | null
          severity: string
          title: string
          trip_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          detail?: string | null
          document_id?: string | null
          href?: string | null
          id?: string
          kind: string
          read_by?: string[]
          required_permission?: Database["public"]["Enums"]["permission_key"] | null
          severity?: string
          title: string
          trip_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          detail?: string | null
          document_id?: string | null
          href?: string | null
          id?: string
          kind?: string
          read_by?: string[]
          required_permission?: Database["public"]["Enums"]["permission_key"] | null
          severity?: string
          title?: string
          trip_id?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          material_id: string
          notes: string | null
          order_id: string
          quantity: number
          selling_rate: number
          unit: Database["public"]["Enums"]["material_unit"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          material_id: string
          notes?: string | null
          order_id: string
          quantity: number
          selling_rate: number
          unit: Database["public"]["Enums"]["material_unit"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          material_id?: string
          notes?: string | null
          order_id?: string
          quantity?: number
          selling_rate?: number
          unit?: Database["public"]["Enums"]["material_unit"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          deleted_at: string | null
          direction: Database["public"]["Enums"]["payment_direction"]
          id: string
          invoice_id: string | null
          mode: Database["public"]["Enums"]["payment_mode"]
          notes: string | null
          party_type: Database["public"]["Enums"]["party_type"]
          payment_code: string
          payment_date: string
          provider_bill_id: string | null
          provider_id: string | null
          reference: string | null
          transporter_bill_id: string | null
          transporter_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          business_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          direction: Database["public"]["Enums"]["payment_direction"]
          id?: string
          invoice_id?: string | null
          mode: Database["public"]["Enums"]["payment_mode"]
          notes?: string | null
          party_type: Database["public"]["Enums"]["party_type"]
          payment_code?: string
          payment_date?: string
          provider_bill_id?: string | null
          provider_id?: string | null
          reference?: string | null
          transporter_bill_id?: string | null
          transporter_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          direction?: Database["public"]["Enums"]["payment_direction"]
          id?: string
          invoice_id?: string | null
          mode?: Database["public"]["Enums"]["payment_mode"]
          notes?: string | null
          party_type?: Database["public"]["Enums"]["party_type"]
          payment_code?: string
          payment_date?: string
          provider_bill_id?: string | null
          provider_id?: string | null
          reference?: string | null
          transporter_bill_id?: string | null
          transporter_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      provider_bill_items: {
        Row: {
          amount: number
          bill_id: string
          billed_reference: string | null
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          line_date: string | null
          material_id: string | null
          notes: string | null
          purchase_id: string | null
          quantity: number | null
          rate: number | null
          trip_id: string | null
          unit: Database["public"]["Enums"]["material_unit"] | null
          updated_at: string
          updated_by: string | null
          vehicle_number: string | null
        }
        Insert: {
          amount: number
          bill_id: string
          billed_reference?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          line_date?: string | null
          material_id?: string | null
          notes?: string | null
          purchase_id?: string | null
          quantity?: number | null
          rate?: number | null
          trip_id?: string | null
          unit?: Database["public"]["Enums"]["material_unit"] | null
          updated_at?: string
          updated_by?: string | null
          vehicle_number?: string | null
        }
        Update: {
          amount?: number
          bill_id?: string
          billed_reference?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          line_date?: string | null
          material_id?: string | null
          notes?: string | null
          purchase_id?: string | null
          quantity?: number | null
          rate?: number | null
          trip_id?: string | null
          unit?: Database["public"]["Enums"]["material_unit"] | null
          updated_at?: string
          updated_by?: string | null
          vehicle_number?: string | null
        }
        Relationships: []
      }
      provider_bills: {
        Row: {
          bill_date: string
          bill_number: string
          business_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          document_id: string | null
          due_date: string | null
          id: string
          notes: string | null
          provider_id: string
          recon_status: Database["public"]["Enums"]["recon_status"]
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bill_date: string
          bill_number: string
          business_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_id?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          provider_id: string
          recon_status?: Database["public"]["Enums"]["recon_status"]
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bill_date?: string
          bill_number?: string
          business_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_id?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          provider_id?: string
          recon_status?: Database["public"]["Enums"]["recon_status"]
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      provider_materials: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          material_id: string
          provider_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          material_id: string
          provider_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          material_id?: string
          provider_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      purchase_items: {
        Row: {
          additional_costs: number
          business_id: string
          cost_breakdown: Json
          created_at: string
          created_by: string | null
          id: string
          material_id: string
          notes: string | null
          purchase_id: string
          quantity: number
          rate: number
          unit: Database["public"]["Enums"]["material_unit"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          additional_costs?: number
          business_id?: string
          cost_breakdown?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          material_id: string
          notes?: string | null
          purchase_id: string
          quantity: number
          rate: number
          unit: Database["public"]["Enums"]["material_unit"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          additional_costs?: number
          business_id?: string
          cost_breakdown?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          material_id?: string
          notes?: string | null
          purchase_id?: string
          quantity?: number
          rate?: number
          unit?: Database["public"]["Enums"]["material_unit"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      purchases: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          delivery_mode: Database["public"]["Enums"]["delivery_mode"]
          id: string
          notes: string | null
          order_id: string | null
          provider_id: string
          purchase_code: string
          purchase_date: string
          source: Database["public"]["Enums"]["record_source"]
          status: Database["public"]["Enums"]["purchase_status"]
          stock_location_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          delivery_mode: Database["public"]["Enums"]["delivery_mode"]
          id?: string
          notes?: string | null
          order_id?: string | null
          provider_id: string
          purchase_code?: string
          purchase_date?: string
          source?: Database["public"]["Enums"]["record_source"]
          status?: Database["public"]["Enums"]["purchase_status"]
          stock_location_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          delivery_mode?: Database["public"]["Enums"]["delivery_mode"]
          id?: string
          notes?: string | null
          order_id?: string | null
          provider_id?: string
          purchase_code?: string
          purchase_date?: string
          source?: Database["public"]["Enums"]["record_source"]
          status?: Database["public"]["Enums"]["purchase_status"]
          stock_location_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      reconciliation_records: {
        Row: {
          amount_difference: number | null
          bill_id: string | null
          bill_type: Database["public"]["Enums"]["bill_type"]
          billed_amount: number | null
          billed_quantity: number | null
          billed_trips: number | null
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string | null
          note: string | null
          provider_bill_id: string | null
          quantity_difference: number | null
          reason: string | null
          recorded_amount: number | null
          recorded_quantity: number | null
          recorded_trips: number | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["recon_status"]
          transporter_bill_id: string | null
          trip_difference: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount_difference?: never
          bill_id?: never
          bill_type: Database["public"]["Enums"]["bill_type"]
          billed_amount?: number | null
          billed_quantity?: number | null
          billed_trips?: number | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string | null
          note?: string | null
          provider_bill_id?: string | null
          quantity_difference?: never
          reason?: string | null
          recorded_amount?: number | null
          recorded_quantity?: number | null
          recorded_trips?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["recon_status"]
          transporter_bill_id?: string | null
          trip_difference?: never
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount_difference?: never
          bill_id?: never
          bill_type?: Database["public"]["Enums"]["bill_type"]
          billed_amount?: number | null
          billed_quantity?: number | null
          billed_trips?: number | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string | null
          note?: string | null
          provider_bill_id?: string | null
          quantity_difference?: never
          reason?: string | null
          recorded_amount?: number | null
          recorded_quantity?: number | null
          recorded_trips?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["recon_status"]
          transporter_bill_id?: string | null
          trip_difference?: never
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      stock_locations: {
        Row: {
          address: string | null
          business_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          material_id: string
          movement_date: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          notes: string | null
          purchase_item_id: string | null
          quantity: number
          stock_location_id: string
          updated_at: string
          updated_by: string | null
          weight_record_id: string | null
        }
        Insert: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          material_id: string
          movement_date: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          notes?: string | null
          purchase_item_id?: string | null
          quantity: number
          stock_location_id: string
          updated_at?: string
          updated_by?: string | null
          weight_record_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          material_id?: string
          movement_date?: string
          movement_type?: Database["public"]["Enums"]["stock_movement_type"]
          notes?: string | null
          purchase_item_id?: string | null
          quantity?: number
          stock_location_id?: string
          updated_at?: string
          updated_by?: string | null
          weight_record_id?: string | null
        }
        Relationships: []
      }
      transporter_bill_trips: {
        Row: {
          bill_id: string
          billed_amount: number
          billed_reference: string | null
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          trip_date: string | null
          trip_id: string | null
          updated_at: string
          updated_by: string | null
          vehicle_number: string | null
        }
        Insert: {
          bill_id: string
          billed_amount: number
          billed_reference?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          trip_date?: string | null
          trip_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_number?: string | null
        }
        Update: {
          bill_id?: string
          billed_amount?: number
          billed_reference?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          trip_date?: string | null
          trip_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_number?: string | null
        }
        Relationships: []
      }
      transporter_bills: {
        Row: {
          bill_date: string
          bill_number: string
          business_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          document_id: string | null
          due_date: string | null
          id: string
          notes: string | null
          period_from: string | null
          period_to: string | null
          recon_status: Database["public"]["Enums"]["recon_status"]
          subtotal: number
          tax_amount: number
          total_amount: number
          transporter_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bill_date: string
          bill_number: string
          business_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_id?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          period_from?: string | null
          period_to?: string | null
          recon_status?: Database["public"]["Enums"]["recon_status"]
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          transporter_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bill_date?: string
          bill_number?: string
          business_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_id?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          period_from?: string | null
          period_to?: string | null
          recon_status?: Database["public"]["Enums"]["recon_status"]
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          transporter_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      transporters: {
        Row: {
          business_id: string
          city: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          gstin: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          rate_per_trip: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_id?: string
          city?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          rate_per_trip?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_id?: string
          city?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          rate_per_trip?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      truck_trips: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          driver_id: string | null
          freight_amount: number
          id: string
          material_id: string
          notes: string | null
          order_id: string
          order_item_id: string | null
          provider_id: string | null
          purchase_id: string | null
          site_id: string
          source: Database["public"]["Enums"]["record_source"]
          status: Database["public"]["Enums"]["trip_status"]
          stock_location_id: string | null
          transporter_id: string
          trip_code: string
          updated_at: string
          updated_by: string | null
          vehicle_id: string
        }
        Insert: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          driver_id?: string | null
          freight_amount?: number
          id?: string
          material_id: string
          notes?: string | null
          order_id: string
          order_item_id?: string | null
          provider_id?: string | null
          purchase_id?: string | null
          site_id: string
          source?: Database["public"]["Enums"]["record_source"]
          status?: Database["public"]["Enums"]["trip_status"]
          stock_location_id?: string | null
          transporter_id: string
          trip_code?: string
          updated_at?: string
          updated_by?: string | null
          vehicle_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          driver_id?: string | null
          freight_amount?: number
          id?: string
          material_id?: string
          notes?: string | null
          order_id?: string
          order_item_id?: string | null
          provider_id?: string | null
          purchase_id?: string | null
          site_id?: string
          source?: Database["public"]["Enums"]["record_source"]
          status?: Database["public"]["Enums"]["trip_status"]
          stock_location_id?: string | null
          transporter_id?: string
          trip_code?: string
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          permission: Database["public"]["Enums"]["permission_key"]
          profile_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          permission: Database["public"]["Enums"]["permission_key"]
          profile_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          permission?: Database["public"]["Enums"]["permission_key"]
          profile_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          business_id: string
          capacity_mt: number | null
          created_at: string
          created_by: string | null
          default_driver_id: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          transporter_id: string
          updated_at: string
          updated_by: string | null
          vehicle_number: string
          vehicle_number_normalized: string | null
          vehicle_type: string | null
        }
        Insert: {
          business_id?: string
          capacity_mt?: number | null
          created_at?: string
          created_by?: string | null
          default_driver_id?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          transporter_id: string
          updated_at?: string
          updated_by?: string | null
          vehicle_number: string
          vehicle_number_normalized?: never
          vehicle_type?: string | null
        }
        Update: {
          business_id?: string
          capacity_mt?: number | null
          created_at?: string
          created_by?: string | null
          default_driver_id?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          transporter_id?: string
          updated_at?: string
          updated_by?: string | null
          vehicle_number?: string
          vehicle_number_normalized?: never
          vehicle_type?: string | null
        }
        Relationships: []
      }
      weight_records: {
        Row: {
          business_id: string
          calculated_net: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          document_id: string | null
          gross: number | null
          has_net_mismatch: boolean | null
          id: string
          location: string | null
          measured_at: string
          measurement_method: Database["public"]["Enums"]["measurement_method"]
          net_quantity: number | null
          printed_net: number | null
          record_type: Database["public"]["Enums"]["weight_record_type"]
          slip_number: string | null
          source: Database["public"]["Enums"]["record_source"]
          tare: number | null
          trip_id: string
          updated_at: string
          updated_by: string | null
          vehicle_number: string | null
        }
        Insert: {
          business_id?: string
          calculated_net?: never
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_id?: string | null
          gross?: number | null
          has_net_mismatch?: never
          id?: string
          location?: string | null
          measured_at: string
          measurement_method?: Database["public"]["Enums"]["measurement_method"]
          net_quantity?: never
          printed_net?: number | null
          record_type: Database["public"]["Enums"]["weight_record_type"]
          slip_number?: string | null
          source?: Database["public"]["Enums"]["record_source"]
          tare?: number | null
          trip_id: string
          updated_at?: string
          updated_by?: string | null
          vehicle_number?: string | null
        }
        Update: {
          business_id?: string
          calculated_net?: never
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_id?: string | null
          gross?: number | null
          has_net_mismatch?: never
          id?: string
          location?: string | null
          measured_at?: string
          measurement_method?: Database["public"]["Enums"]["measurement_method"]
          net_quantity?: never
          printed_net?: number | null
          record_type?: Database["public"]["Enums"]["weight_record_type"]
          slip_number?: string | null
          source?: Database["public"]["Enums"]["record_source"]
          tare?: number | null
          trip_id?: string
          updated_at?: string
          updated_by?: string | null
          vehicle_number?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_customer_outstanding: {
        Row: {
          business_id: string | null
          customer_id: string | null
          customer_name: string | null
          invoice_count: number | null
          invoiced_amount: number | null
          outstanding_amount: number | null
          overdue_amount: number | null
          received_amount: number | null
        }
        Relationships: []
      }
      v_customer_stats: {
        Row: {
          active_orders: number | null
          business_id: string | null
          customer_id: string | null
          site_count: number | null
        }
        Relationships: []
      }
      v_material_stats: {
        Row: {
          business_id: string | null
          delivered_qty: number | null
          material_id: string | null
          order_count: number | null
          yard_stock: number | null
        }
        Relationships: []
      }
      v_order_list: {
        Row: {
          business_id: string | null
          created_at: string | null
          created_by: string | null
          created_by_name: string | null
          customer_id: string | null
          customer_name: string | null
          customer_reference: string | null
          delivered_qty: number | null
          dispatched_qty: number | null
          estimated_profit: number | null
          expected_delivery: string | null
          id: string | null
          material_ids: string[] | null
          materials_label: string | null
          notes: string | null
          order_code: string | null
          order_date: string | null
          order_value: number | null
          required_qty: number | null
          site_id: string | null
          site_name: string | null
          status: Database["public"]["Enums"]["order_status"] | null
          trip_count: number | null
          unit_label: string | null
        }
        Relationships: []
      }
      v_order_profit: {
        Row: {
          business_id: string | null
          customer_id: string | null
          customer_name: string | null
          estimated_profit: number | null
          labour_cost: number | null
          loading_unloading_cost: number | null
          margin_pct: number | null
          order_code: string | null
          order_id: string | null
          order_status: Database["public"]["Enums"]["order_status"] | null
          other_expenses: number | null
          profit_status: string | null
          purchase_cost: number | null
          sales_value: number | null
          transport_cost: number | null
          trip_count: number | null
        }
        Relationships: []
      }
      v_order_progress: {
        Row: {
          business_id: string | null
          customer_id: string | null
          customer_name: string | null
          delivered_pct: number | null
          delivered_qty: number | null
          dispatched_qty: number | null
          expected_delivery: string | null
          material_id: string | null
          material_name: string | null
          order_code: string | null
          order_date: string | null
          order_id: string | null
          order_item_id: string | null
          order_status: Database["public"]["Enums"]["order_status"] | null
          order_value: number | null
          ordered_qty: number | null
          pending_qty: number | null
          selling_rate: number | null
          site_id: string | null
          site_name: string | null
          trip_count: number | null
          unit: Database["public"]["Enums"]["material_unit"] | null
        }
        Relationships: []
      }
      v_provider_payable: {
        Row: {
          bill_count: number | null
          billed_amount: number | null
          bills_needing_attention: number | null
          business_id: string | null
          paid_amount: number | null
          payable_amount: number | null
          provider_id: string | null
          provider_name: string | null
        }
        Relationships: []
      }
      v_provider_stats: {
        Row: {
          business_id: string | null
          material_ids: string[] | null
          provider_id: string | null
          purchase_count: number | null
          purchase_value: number | null
        }
        Relationships: []
      }
      v_purchase_list: {
        Row: {
          additional_costs: number | null
          base_amount: number | null
          business_id: string | null
          cost_breakdown: Json | null
          created_at: string | null
          customer_name: string | null
          delivery_mode: Database["public"]["Enums"]["delivery_mode"] | null
          document_ids: string[] | null
          id: string | null
          material_id: string | null
          material_name: string | null
          notes: string | null
          order_code: string | null
          order_id: string | null
          provider_id: string | null
          provider_name: string | null
          purchase_code: string | null
          purchase_date: string | null
          purchase_item_id: string | null
          quantity: number | null
          rate: number | null
          source: Database["public"]["Enums"]["record_source"] | null
          status: Database["public"]["Enums"]["purchase_status"] | null
          stock_location_id: string | null
          stock_location_name: string | null
          total_amount: number | null
          trip_count: number | null
          unit: Database["public"]["Enums"]["material_unit"] | null
        }
        Relationships: []
      }
      v_stock_balance: {
        Row: {
          adjusted_qty: number | null
          balance_qty: number | null
          business_id: string | null
          issued_qty: number | null
          last_movement_date: string | null
          material_id: string | null
          material_name: string | null
          received_qty: number | null
          stock_location_id: string | null
          stock_location_name: string | null
          unit: Database["public"]["Enums"]["material_unit"] | null
        }
        Relationships: []
      }
      v_stock_ledger: {
        Row: {
          balance_after: number | null
          business_id: string | null
          created_at: string | null
          id: string | null
          material_id: string | null
          material_name: string | null
          movement_date: string | null
          movement_type: Database["public"]["Enums"]["stock_movement_type"] | null
          notes: string | null
          quantity: number | null
          reference_code: string | null
          reference_id: string | null
          reference_type: string | null
          stock_location_id: string | null
          stock_location_name: string | null
          unit: Database["public"]["Enums"]["material_unit"] | null
        }
        Relationships: []
      }
      v_transporter_payable: {
        Row: {
          bill_count: number | null
          billed_amount: number | null
          bills_needing_attention: number | null
          business_id: string | null
          paid_amount: number | null
          payable_amount: number | null
          transporter_id: string | null
          transporter_name: string | null
        }
        Relationships: []
      }
      v_trip_list: {
        Row: {
          business_id: string | null
          created_at: string | null
          customer_id: string | null
          customer_name: string | null
          delivered_at: string | null
          delivered_net: number | null
          delivery_document_id: string | null
          delivery_gross: number | null
          delivery_location: string | null
          delivery_method: Database["public"]["Enums"]["measurement_method"] | null
          delivery_net_mismatch: boolean | null
          delivery_printed_net: number | null
          delivery_slip_number: string | null
          delivery_source: Database["public"]["Enums"]["record_source"] | null
          delivery_tare: number | null
          delivery_weight_id: string | null
          document_count: number | null
          driver_id: string | null
          driver_name: string | null
          freight_amount: number | null
          id: string | null
          investigated_at: string | null
          investigated_by_name: string | null
          investigation_notes: string | null
          investigation_outcome: Database["public"]["Enums"]["investigation_outcome"] | null
          loaded_at: string | null
          loading_document_id: string | null
          loading_gross: number | null
          loading_location: string | null
          loading_method: Database["public"]["Enums"]["measurement_method"] | null
          loading_net: number | null
          loading_net_mismatch: boolean | null
          loading_printed_net: number | null
          loading_slip_number: string | null
          loading_source: Database["public"]["Enums"]["record_source"] | null
          loading_tare: number | null
          loading_weight_id: string | null
          material_id: string | null
          material_name: string | null
          order_code: string | null
          order_id: string | null
          order_item_id: string | null
          provider_id: string | null
          provider_name: string | null
          purchase_code: string | null
          purchase_id: string | null
          quantity_difference: number | null
          site_id: string | null
          site_name: string | null
          sort_at: string | null
          source: Database["public"]["Enums"]["record_source"] | null
          status: Database["public"]["Enums"]["trip_status"] | null
          stock_location_id: string | null
          stock_location_name: string | null
          tolerance: number | null
          tolerance_status: Database["public"]["Enums"]["tolerance_status"] | null
          transporter_id: string | null
          transporter_name: string | null
          trip_code: string | null
          unit: Database["public"]["Enums"]["material_unit"] | null
          vehicle_id: string | null
          vehicle_number: string | null
        }
        Relationships: []
      }
      v_trip_summary: {
        Row: {
          business_id: string | null
          created_at: string | null
          customer_id: string | null
          customer_name: string | null
          delivered_at: string | null
          delivered_net: number | null
          delivery_net_mismatch: boolean | null
          delivery_slip_number: string | null
          document_count: number | null
          driver_id: string | null
          driver_name: string | null
          freight_amount: number | null
          id: string | null
          investigation_outcome: Database["public"]["Enums"]["investigation_outcome"] | null
          loaded_at: string | null
          loading_net: number | null
          loading_net_mismatch: boolean | null
          loading_slip_number: string | null
          material_id: string | null
          material_name: string | null
          order_code: string | null
          order_id: string | null
          provider_id: string | null
          provider_name: string | null
          purchase_id: string | null
          quantity_difference: number | null
          site_id: string | null
          site_name: string | null
          source: Database["public"]["Enums"]["record_source"] | null
          status: Database["public"]["Enums"]["trip_status"] | null
          stock_location_id: string | null
          tolerance: number | null
          tolerance_status: Database["public"]["Enums"]["tolerance_status"] | null
          transporter_id: string | null
          transporter_name: string | null
          trip_code: string | null
          unit: Database["public"]["Enums"]["material_unit"] | null
          vehicle_id: string | null
          vehicle_number: string | null
        }
        Relationships: []
      }
      v_trip_weights: {
        Row: {
          business_id: string | null
          delivered_at: string | null
          delivered_net: number | null
          delivery_net_mismatch: boolean | null
          delivery_slip_number: string | null
          delivery_weight_id: string | null
          loaded_at: string | null
          loading_net: number | null
          loading_net_mismatch: boolean | null
          loading_slip_number: string | null
          loading_weight_id: string | null
          trip_id: string | null
        }
        Relationships: []
      }
      v_vehicle_shortage_stats: {
        Row: {
          avg_difference_mt: number | null
          business_id: string | null
          confirmed_shortage_count: number | null
          delivered_trip_count: number | null
          has_recurring_shortage: boolean | null
          needs_verification_count: number | null
          total_shortfall_mt: number | null
          transporter_id: string | null
          transporter_name: string | null
          trip_count: number | null
          vehicle_id: string | null
          vehicle_number: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      ai_reserve_call: { Args: { p_business_id: string }; Returns: boolean }
      app_fail: { Args: { p_message: string }; Returns: undefined }
      apply_document_decision: { Args: { p_decision: Json; p_document_id: string }; Returns: string }
      claim_document_jobs: { Args: { p_limit?: number }; Returns: Database["public"]["Tables"]["document_jobs"]["Row"][] }
      correct_document_field: { Args: { p_document_id: string; p_field: string; p_reason: string; p_value: string }; Returns: undefined }
      create_customer: { Args: { p_customer: Json; p_site?: Json }; Returns: string }
      create_document_from_upload: { Args: { p_business_id: string; p_document_type_hint?: string; p_file_name: string; p_mime_type: string; p_sha256: string; p_size_bytes: number; p_source: Database["public"]["Enums"]["document_intake_source"]; p_storage_path: string; p_trip_hint_id?: string; p_uploaded_by?: string; p_uploaded_by_label?: string }; Returns: Json }
      create_material: { Args: { p_material: Json }; Returns: string }
      create_order: { Args: { p_items: Json; p_order: Json }; Returns: Json }
      create_provider: { Args: { p_material_ids?: string[]; p_provider: Json }; Returns: string }
      create_purchase: { Args: { p_items: Json; p_purchase: Json }; Returns: Json }
      create_trip: { Args: { p_delivery?: Json; p_loading: Json; p_trip: Json }; Returns: Json }
      create_vehicle: { Args: { p_driver?: Json; p_vehicle: Json }; Returns: string }
      current_business_id: { Args: never; Returns: string }
      defer_document_job: { Args: { p_job_id: string; p_note: string; p_until: string }; Returns: undefined }
      document_effective_fields: { Args: { p_document_id: string }; Returns: Json }
      document_for_user: { Args: { p_document_id: string }; Returns: Database["public"]["Tables"]["documents"]["Row"] }
      enqueue_document: { Args: { p_document_id: string }; Returns: string }
      finish_document_job: { Args: { p_error?: string; p_job_id: string }; Returns: Database["public"]["Enums"]["document_job_status"] }
      generate_code: { Args: { p_prefix: string; p_seq: unknown; p_width: number }; Returns: string }
      has_permission: { Args: { p_key: Database["public"]["Enums"]["permission_key"] }; Returns: boolean }
      is_active_user: { Args: never; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
      kick_document_worker: { Args: never; Returns: undefined }
      mark_document_duplicate: { Args: { p_document_id: string; p_original_id: string; p_reason: string }; Returns: undefined }
      mark_notifications_read: { Args: { p_ids: string[] }; Returns: undefined }
      recalculate_invoice_totals: { Args: { p_invoice_id: string }; Returns: undefined }
      record_document_extraction: { Args: { p_document_id: string; p_result: Json }; Returns: undefined }
      record_document_weight: { Args: { p_document_id: string; p_reason: string; p_record_type: Database["public"]["Enums"]["weight_record_type"]; p_trip_id: string }; Returns: string }
      record_trip_investigation: { Args: { p_notes: string; p_outcome: Database["public"]["Enums"]["investigation_outcome"]; p_status?: Database["public"]["Enums"]["trip_status"]; p_trip_id: string }; Returns: undefined }
      register_uploaded_document: { Args: { p_document_type_hint?: string; p_file_name: string; p_mime_type: string; p_sha256: string; p_size_bytes: number; p_storage_path: string; p_trip_hint_id?: string; p_uploaded_by_label?: string }; Returns: Json }
      reject_document: { Args: { p_document_id: string; p_reason: string }; Returns: undefined }
      reprocess_document: { Args: { p_document_id: string }; Returns: undefined }
      require_permission: { Args: { p_key: Database["public"]["Enums"]["permission_key"] }; Returns: undefined }
      review_attach_document: { Args: { p_document_id: string; p_reason: string; p_record_type: Database["public"]["Enums"]["weight_record_type"]; p_trip_id: string }; Returns: undefined }
      review_create_trip_from_document: { Args: { p_document_id: string; p_reason: string; p_trip: Json }; Returns: Json }
      save_weight_record: { Args: { p_reason?: string; p_record_type: Database["public"]["Enums"]["weight_record_type"]; p_trip_id: string; p_values: Json }; Returns: undefined }
      set_material_tolerances: { Args: { p_values: Json }; Returns: number }
      tolerance_status_for: { Args: { p_difference: number; p_tolerance: number }; Returns: Database["public"]["Enums"]["tolerance_status"] }
      update_order: { Args: { p_items: Json; p_order: Json; p_order_id: string; p_reason?: string }; Returns: Json }
    }
    Enums: {
      ai_status: "pending" | "processing" | "succeeded" | "needs_review" | "failed"
      audit_action: "INSERT" | "UPDATE" | "DELETE"
      bill_type: "provider_bill" | "transporter_bill" | "customer_invoice"
      delivery_mode: "direct_to_site" | "stock_yard"
      document_intake_source: "staff_upload" | "driver_link"
      document_job_status: "queued" | "running" | "done" | "failed"
      document_status: "received" | "processing" | "information_extracted" | "matched" | "automatically_recorded" | "needs_review" | "failed" | "duplicate" | "rejected"
      document_type: "weighbridge_slip" | "loading_slip" | "unloading_slip" | "provider_bill" | "transporter_bill" | "delivery_photo" | "payment_receipt" | "other"
      expense_category: "labour" | "loading" | "unloading" | "fuel" | "toll" | "waiting" | "other"
      gst_mode: "cgst_sgst" | "igst" | "none"
      investigation_outcome: "under_investigation" | "weighbridge_calibration_difference" | "moisture_or_spillage_loss" | "site_measurement_difference" | "recovered_from_transporter" | "accepted_as_normal_loss"
      invoice_status: "draft" | "issued" | "cancelled"
      material_unit: "MT" | "CFT" | "BRASS" | "CUM" | "TRIP" | "BAG" | "NOS"
      measurement_method: "weighbridge" | "site_measurement" | "count" | "manual_entry"
      order_status: "draft" | "confirmed" | "in_progress" | "completed" | "on_hold" | "cancelled"
      party_type: "customer" | "provider" | "transporter"
      payment_direction: "incoming" | "outgoing"
      payment_mode: "upi" | "bank_transfer" | "cheque" | "cash"
      permission_key: "view_records" | "manage_orders" | "review_documents" | "manage_trips" | "correct_extracted" | "verify_bills" | "record_payments" | "view_financial_reports"
      purchase_status: "recorded" | "needs_verification" | "billed" | "cancelled"
      recon_status: "unreconciled" | "matched" | "mismatch" | "disputed" | "correction_requested" | "difference_approved" | "reconciled"
      record_source: "document" | "manual"
      review_reason: "low_confidence" | "missing_essential_info" | "multiple_possible_matches" | "conflicting_weight_values" | "financial_discrepancy" | "no_match" | "vehicle_mismatch"
      stock_movement_type: "received" | "issued" | "adjustment"
      tolerance_status: "normal" | "needs_verification" | "confirmed_shortage"
      trip_status: "loaded" | "in_transit" | "delivered" | "needs_verification" | "confirmed_shortage" | "cancelled"
      user_role: "owner" | "employee"
      weight_record_type: "loading" | "delivery"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      ai_status: ["pending", "processing", "succeeded", "needs_review", "failed"],
      audit_action: ["INSERT", "UPDATE", "DELETE"],
      bill_type: ["provider_bill", "transporter_bill", "customer_invoice"],
      delivery_mode: ["direct_to_site", "stock_yard"],
      document_intake_source: ["staff_upload", "driver_link"],
      document_job_status: ["queued", "running", "done", "failed"],
      document_status: ["received", "processing", "information_extracted", "matched", "automatically_recorded", "needs_review", "failed", "duplicate", "rejected"],
      document_type: ["weighbridge_slip", "loading_slip", "unloading_slip", "provider_bill", "transporter_bill", "delivery_photo", "payment_receipt", "other"],
      expense_category: ["labour", "loading", "unloading", "fuel", "toll", "waiting", "other"],
      gst_mode: ["cgst_sgst", "igst", "none"],
      investigation_outcome: ["under_investigation", "weighbridge_calibration_difference", "moisture_or_spillage_loss", "site_measurement_difference", "recovered_from_transporter", "accepted_as_normal_loss"],
      invoice_status: ["draft", "issued", "cancelled"],
      material_unit: ["MT", "CFT", "BRASS", "CUM", "TRIP", "BAG", "NOS"],
      measurement_method: ["weighbridge", "site_measurement", "count", "manual_entry"],
      order_status: ["draft", "confirmed", "in_progress", "completed", "on_hold", "cancelled"],
      party_type: ["customer", "provider", "transporter"],
      payment_direction: ["incoming", "outgoing"],
      payment_mode: ["upi", "bank_transfer", "cheque", "cash"],
      permission_key: ["view_records", "manage_orders", "review_documents", "manage_trips", "correct_extracted", "verify_bills", "record_payments", "view_financial_reports"],
      purchase_status: ["recorded", "needs_verification", "billed", "cancelled"],
      recon_status: ["unreconciled", "matched", "mismatch", "disputed", "correction_requested", "difference_approved", "reconciled"],
      record_source: ["document", "manual"],
      review_reason: ["low_confidence", "missing_essential_info", "multiple_possible_matches", "conflicting_weight_values", "financial_discrepancy", "no_match", "vehicle_mismatch"],
      stock_movement_type: ["received", "issued", "adjustment"],
      tolerance_status: ["normal", "needs_verification", "confirmed_shortage"],
      trip_status: ["loaded", "in_transit", "delivered", "needs_verification", "confirmed_shortage", "cancelled"],
      user_role: ["owner", "employee"],
      weight_record_type: ["loading", "delivery"],
    },
  },
} as const
