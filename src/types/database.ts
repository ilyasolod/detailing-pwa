export type ThemePreset = 'dark_studio' | 'clean_automotive' | 'performance'

export interface DesignSettings {
  theme_preset: ThemePreset
  primary_color: string
  secondary_color?: string
  accent_color: string
  background_color?: string
  text_color?: string
  font_pair?: string
  border_radius?: string
  hero_image?: string
  image_style?: string
}

export type DurationCalculationMode = 'max' | 'sum'

export interface Company {
  id: string
  slug: string
  name: string
  description: string | null
  logo_url: string | null
  address: string | null
  whatsapp_number: string
  timezone: string
  design_settings: DesignSettings
  duration_calculation_mode?: DurationCalculationMode
  active: boolean
  created_at: string
}

export type AdminRole = 'owner' | 'admin'

export interface CompanyAdmin {
  id: string
  company_id: string
  user_id: string
  role: AdminRole
}

export interface Service {
  id: string
  company_id: string
  name: string
  description: string | null
  price_from: number
  duration_minutes: number
  image_url: string | null
  active: boolean
  sort_order: number

  // Legacy compat fields
  tenant_id?: string
  price?: number
  category?: string | null
  is_active?: boolean
  requires_parts?: boolean
  parts_hint?: string
}

export interface GalleryPhoto {
  id: string
  company_id: string
  image_url: string
  sort_order: number
}

export interface WeeklyScheduleDay {
  id: string
  company_id: string
  weekday: number // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  is_working: boolean
  opening_time: string // HH:MM
  closing_time: string // HH:MM
}

export interface ScheduleBreak {
  id: string
  company_id: string
  weekday: number
  start_time: string // HH:MM
  end_time: string // HH:MM
}

export interface BlockedInterval {
  id: string
  company_id: string
  starts_at: string // ISO timestamptz
  ends_at: string // ISO timestamptz
  reason: string | null
}

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'expired'

export interface ServiceSnapshot {
  id: string
  name: string
  price_from: number
  duration_minutes: number
}

export interface Booking {
  id: string
  company_id: string
  public_code: string
  client_name: string
  client_phone: string
  car_make: string
  car_model: string
  services_snapshot: ServiceSnapshot[]
  total_price_from: number
  total_duration_minutes: number
  starts_at: string // ISO
  ends_at: string // ISO
  status: BookingStatus
  expires_at: string | null // ISO (created_at + 30 min)
  created_at: string
  updated_at?: string

  // Legacy compat fields
  tenant_id?: string
  occupancy_id?: string
  service_id?: string
  resource_id?: string
  client_vehicle?: string
  price_snapshot?: number
  access_token_hash?: string
  idempotency_key?: string
  start_at?: string
  end_at?: string
  notes?: string
  parts_option?: 'client' | 'service' | 'none'
  vin_or_plate?: string
  is_rescheduled?: boolean
  original_start_at?: string
}

export interface CompanyPublicData {
  company: Company
  services: Service[]
  gallery_photos: GalleryPhoto[]
  weekly_schedule: WeeklyScheduleDay[]
  schedule_breaks: ScheduleBreak[]
}

export interface AvailableSlot {
  starts_at: string // ISO string
  ends_at: string // ISO string
  formatted_time: string // HH:MM
}
