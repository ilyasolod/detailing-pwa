import type { DesignSettings } from '../types/database'

/**
 * Returns dynamic CSS style variables based on company's design_settings.
 * Ensures uniform layout, accessibility, and high contrast Automotive Premium aesthetic.
 */
export function getCompanyCssVariables(settings?: DesignSettings): React.CSSProperties {
  const preset = settings?.theme_preset || 'dark_studio'
  const primary = settings?.primary_color || (preset === 'clean_automotive' ? '#3B82F6' : preset === 'performance' ? '#EF4444' : '#E5A93C')
  const accent = settings?.accent_color || (preset === 'clean_automotive' ? '#06B6D4' : preset === 'performance' ? '#F97316' : '#F59E0B')
  const bg = settings?.background_color || (preset === 'clean_automotive' ? '#090D16' : preset === 'performance' ? '#0C0A09' : '#0A0A0C')
  const radius = settings?.border_radius || (preset === 'performance' ? '10px' : preset === 'clean_automotive' ? '12px' : '16px')

  return {
    ['--brand-primary' as string]: primary,
    ['--brand-accent' as string]: accent,
    ['--bg-custom-base' as string]: bg,
    ['--brand-radius' as string]: radius,
  } as React.CSSProperties
}
