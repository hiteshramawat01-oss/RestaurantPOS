import type { ThemeConfig } from 'antd';

/**
 * Material Design 3 colour roles, generated with Google's
 * material-color-utilities (SchemeFidelity) from the brand orange #C2410C.
 * The same values are CSS variables in styles/global.scss.
 */
export const M3 = {
  primary: '#9b2f00',
  onPrimary: '#ffffff',
  primaryContainer: '#c2410c',
  onPrimaryContainer: '#ffece7',
  secondaryContainer: '#ffdbd0',
  onSecondaryContainer: '#3a0b00',
  error: '#ba1a1a',
  surface: '#fff8f6',
  surfaceContainerLow: '#fff1ed',
  surfaceContainer: '#ffe9e3',
  surfaceContainerHigh: '#fce3db',
  onSurface: '#261814',
  onSurfaceVariant: '#59413a',
  outline: '#8d7168',
  outlineVariant: '#e1bfb5',
};

export const FONT = "Roboto, 'Roboto Flex', 'Google Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";

export const theme: ThemeConfig = {
  token: {
    colorPrimary: M3.primary,
    colorInfo: M3.primary,
    colorSuccess: '#326a2d',
    colorWarning: '#775a00',
    colorError: M3.error,
    colorText: M3.onSurface,
    colorTextSecondary: M3.onSurfaceVariant,
    colorTextTertiary: M3.onSurfaceVariant,
    colorBgLayout: M3.surface,
    colorBgContainer: '#ffffff',
    colorBgElevated: M3.surfaceContainerLow,
    colorBorder: M3.outline,
    colorBorderSecondary: M3.outlineVariant,
    fontFamily: FONT,
    fontSize: 16,
    // Material: 40dp buttons inside 48dp targets, 56dp text fields
    controlHeight: 48,
    controlHeightLG: 56,
    controlHeightSM: 40,
    borderRadius: 12,
    borderRadiusLG: 16,
    borderRadiusSM: 8,
  },
  components: {
    Button: {
      borderRadius: 24,
      borderRadiusLG: 28,
      borderRadiusSM: 20,
      fontWeight: 500,
      contentFontSizeLG: 16,
      paddingInline: 24,
      paddingInlineLG: 24,
      primaryShadow: 'none',
      defaultShadow: 'none',
      dangerShadow: 'none',
      defaultBorderColor: M3.outline,
      defaultColor: M3.primary,
    },
    Input: { borderRadius: 4, borderRadiusLG: 4, paddingInlineLG: 16 },
    InputNumber: { borderRadius: 4, borderRadiusLG: 4 },
    Select: { borderRadius: 4, borderRadiusLG: 4 },
    Modal: { borderRadiusLG: 28, titleFontSize: 24, titleLineHeight: 1.33, contentBg: M3.surfaceContainerHigh, headerBg: M3.surfaceContainerHigh },
    Drawer: { colorBgElevated: M3.surfaceContainerLow },
    Segmented: {
      itemSelectedBg: M3.secondaryContainer,
      itemSelectedColor: M3.onSecondaryContainer,
      trackBg: 'transparent',
      trackPadding: 0,
      borderRadius: 20,
      borderRadiusSM: 20,
      borderRadiusLG: 20,
    },
    Switch: { handleSize: 24, trackHeight: 32, trackMinWidth: 52, trackPadding: 4 },
    Alert: { borderRadiusLG: 12 },
    Message: { contentBg: '#3c2d28', contentPadding: '14px 16px' },
  },
};
