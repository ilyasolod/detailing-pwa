import type {
  Company,
  CompanyAdmin,
  Service,
  GalleryPhoto,
  WeeklyScheduleDay,
  ScheduleBreak,
  BlockedInterval,
  Booking,
  BookingStatus,
  ServiceSnapshot,
} from '../types/database'

export type {
  Company,
  CompanyAdmin,
  Service,
  GalleryPhoto,
  WeeklyScheduleDay,
  ScheduleBreak,
  BlockedInterval,
  Booking,
  BookingStatus,
  ServiceSnapshot,
}

// Backwards-compat aliases for older legacy helper modules
export interface Resource {
  id: string
  tenant_id: string
  name: string
  is_active: boolean
  created_at?: string
}

export interface ResourceOccupancy {
  id: string
  tenant_id: string
  resource_id: string
  occupancy_type: 'booking' | 'block'
  start_at: string
  end_at: string
  created_at?: string
}

export interface Payment {
  id: string
  tenant_id: string
  booking_id: string
  amount: number
  payment_type: 'payment' | 'refund'
  payment_method: string
  notes?: string
  recorded_at?: string
}

export interface Database {
  public: {
    Tables: {
      companies: {
        Row: Company
        Insert: Omit<Company, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['companies']['Insert']>
      }
      company_admins: {
        Row: CompanyAdmin
        Insert: Omit<CompanyAdmin, 'id'> & {
          id?: string
        }
        Update: Partial<Database['public']['Tables']['company_admins']['Insert']>
      }
      services: {
        Row: Service
        Insert: Omit<Service, 'id'> & {
          id?: string
        }
        Update: Partial<Database['public']['Tables']['services']['Insert']>
      }
      gallery_photos: {
        Row: GalleryPhoto
        Insert: Omit<GalleryPhoto, 'id'> & {
          id?: string
        }
        Update: Partial<Database['public']['Tables']['gallery_photos']['Insert']>
      }
      weekly_schedule: {
        Row: WeeklyScheduleDay
        Insert: Omit<WeeklyScheduleDay, 'id'> & {
          id?: string
        }
        Update: Partial<Database['public']['Tables']['weekly_schedule']['Insert']>
      }
      schedule_breaks: {
        Row: ScheduleBreak
        Insert: Omit<ScheduleBreak, 'id'> & {
          id?: string
        }
        Update: Partial<Database['public']['Tables']['schedule_breaks']['Insert']>
      }
      blocked_intervals: {
        Row: BlockedInterval
        Insert: Omit<BlockedInterval, 'id'> & {
          id?: string
        }
        Update: Partial<Database['public']['Tables']['blocked_intervals']['Insert']>
      }
      bookings: {
        Row: Booking
        Insert: Omit<Booking, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['bookings']['Insert']>
      }
      booking_idempotency_records: {
        Row: {
          id: string
          company_id: string
          idempotency_key: string
          booking_id: string | null
          params_hash: string
          response_data: unknown
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          idempotency_key: string
          booking_id?: string | null
          params_hash: string
          response_data: unknown
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['booking_idempotency_records']['Insert']>
      }
    }
    Functions: {
      get_company_by_slug: {
        Args: { p_slug: string }
        Returns: unknown
      }
      get_available_slots: {
        Args: {
          p_company_id: string
          p_service_ids: string[]
          p_date: string
        }
        Returns: unknown
      }
      create_booking: {
        Args: {
          p_company_id: string
          p_service_ids: string[]
          p_client_name: string
          p_client_phone: string
          p_car_make: string
          p_car_model: string
          p_starts_at: string
          p_idempotency_key?: string
        }
        Returns: unknown
      }
    }
  }
}
