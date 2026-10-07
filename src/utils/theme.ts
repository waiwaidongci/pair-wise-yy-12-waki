import { alpha, createTheme } from "@mui/material/styles";

export const appTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#2368e7",
    },
    secondary: {
      main: "#0d8a72",
    },
    warning: {
      main: "#d17b20",
    },
    error: {
      main: "#cb4052",
    },
    background: {
      default: "#eef1f5",
      paper: "#ffffff",
    },
    text: {
      primary: "#18202f",
      secondary: "#68758a",
    },
    divider: alpha("#18202f", 0.1),
  },
  shape: {
    borderRadius: 10,
  },
  typography: {
    fontFamily: '"Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif',
    h5: {
      fontWeight: 800,
    },
    h6: {
      fontWeight: 800,
    },
    button: {
      fontWeight: 700,
      textTransform: "none",
    },
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
    MuiTooltip: {
      defaultProps: {
        arrow: true,
      },
    },
  },
});
