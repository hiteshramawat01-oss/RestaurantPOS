import type { ThemeConfig } from 'antd';

export const theme: ThemeConfig = {
  token: {
    colorPrimary: '#26336b',
    colorInfo: '#26336b',
    colorSuccess: '#1f7a4d',
    colorWarning: '#b7791f',
    colorError: '#b42318',
    colorText: '#1b1f2a',
    colorTextSecondary: '#464d5e',
    colorBgLayout: '#f3f4f7',
    colorBorder: '#c4c9d6',
    colorBorderSecondary: '#dde0e8',
    borderRadius: 10,
    fontFamily: "'Atkinson Hyperlegible Next Variable', system-ui, sans-serif",
    fontSize: 15,
    controlHeight: 44,
    controlHeightLG: 52,
    controlHeightSM: 34,
  },
  components: {
    Button: { fontWeight: 600, primaryShadow: 'none', defaultShadow: 'none', dangerShadow: 'none' },
    Modal: { titleFontSize: 19 },
    Segmented: { itemSelectedBg: '#26336b', itemSelectedColor: '#ffffff', trackPadding: 4 },
    Switch: { handleSize: 22, trackHeight: 26, trackMinWidth: 48 },
  },
};
