import {
  AppBar,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  LinearProgress,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AutoAwesomeMosaicRounded,
  CloudDoneRounded,
  KeyboardAltRounded,
  RateReviewRounded,
  RefreshRounded,
  SensorsRounded,
  WarningAmberRounded,
} from "@mui/icons-material";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useWorkspaceSummary } from "../queries/workspace";
import { useWorkbenchStore } from "../stores/workbenchStore";

export default function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data, isLoading } = useWorkspaceSummary();
  const autosave = useWorkbenchStore((state) => state.autosave);
  const lastSavedAt = useWorkbenchStore((state) => state.lastSavedAt);
  const persistStatus = useWorkbenchStore((state) => state.persistStatus);
  const saveNow = useWorkbenchStore((state) => state.saveNow);
  const retryPersist = useWorkbenchStore((state) => state.retryPersist);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: "1px solid", borderColor: "divider", bgcolor: "rgba(255,255,255,.92)", backdropFilter: "blur(18px)" }}>
        <Toolbar sx={{ minHeight: 64, gap: 2, px: { xs: 2, lg: 3 } }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.4, minWidth: 230 }}>
            <Box sx={{ width: 36, height: 36, borderRadius: 1.4, bgcolor: "primary.main", color: "white", display: "grid", placeItems: "center" }}>
              <AutoAwesomeMosaicRounded fontSize="small" />
            </Box>
            <Box>
              <Typography sx={{ fontSize: 14, fontWeight: 900, lineHeight: 1.1 }}>衡准数据标注工作台</Typography>
              <Typography sx={{ fontSize: 10.5, color: "text.secondary", mt: 0.35 }}>
                {isLoading ? "载入项目..." : `${data?.projectCode} · ${data?.projectName}`}
              </Typography>
            </Box>
          </Box>

          <Stack direction="row" spacing={0.6} sx={{ ml: 1 }}>
            <Button
              size="small"
              startIcon={<SensorsRounded />}
              color={location.pathname.includes("annotate") ? "primary" : "inherit"}
              variant={location.pathname.includes("annotate") ? "contained" : "text"}
              onClick={() => navigate("/annotate")}
            >
              标注工作区
            </Button>
            <Button
              size="small"
              startIcon={<RateReviewRounded />}
              color={location.pathname.includes("review") ? "primary" : "inherit"}
              variant={location.pathname.includes("review") ? "contained" : "text"}
              onClick={() => navigate("/review")}
            >
              冲突审核
            </Button>
          </Stack>

          <Box sx={{ flex: 1 }} />

          {isLoading ? (
            <CircularProgress size={22} />
          ) : (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ display: { xs: "none", md: "flex" } }}>
              <Chip size="small" label={`今日 ${data?.completedToday ?? 0} 项`} />
              <Chip size="small" color="success" variant="outlined" label={`质检 ${data?.qualityScore ?? 0}%`} />
              <Chip size="small" variant="outlined" label={`截止 ${data?.dueAt ?? "-"}`} />
            </Stack>
          )}

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {persistStatus.pending ? (
            <Stack direction="row" spacing={0.4} alignItems="center">
              <Tooltip title={`落盘失败：${persistStatus.error ?? "未知错误"}。上一版内容已保留，点击重试（不会重复追加）`}>
                <Button
                  size="small"
                  color="error"
                  startIcon={<WarningAmberRounded />}
                  variant="outlined"
                  onClick={retryPersist}
                >
                  保存失败 · 点击重试
                </Button>
              </Tooltip>
              <Tooltip title="重试落盘">
                <IconButton size="small" color="error" onClick={retryPersist}>
                  <RefreshRounded fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          ) : (
            <Tooltip title={`最近保存：${new Date(lastSavedAt).toLocaleTimeString("zh-CN", { hour12: false })}`}>
              <Button
                size="small"
                color={autosave === "保存中" ? "warning" : "inherit"}
                startIcon={<CloudDoneRounded />}
                onClick={saveNow}
              >
                {autosave}
              </Button>
            </Tooltip>
          )}
          <Tooltip title="快捷键：1-5 标签，B/P/K 工具，N 下一题，空格播放音频">
            <Button size="small" color="inherit" startIcon={<KeyboardAltRounded />} sx={{ display: { xs: "none", lg: "inline-flex" } }}>
              快捷键
            </Button>
          </Tooltip>
          <Avatar sx={{ width: 34, height: 34, fontSize: 13, bgcolor: "#34435b" }}>林</Avatar>
        </Toolbar>
        {autosave === "保存中" && <LinearProgress color={persistStatus.pending ? "error" : "primary"} sx={{ height: 2 }} />}
      </AppBar>
      <Outlet />
      <Box component="footer" sx={{ px: 3, py: 2, color: "text.secondary", fontSize: 11, display: "flex", justifyContent: "space-between" }}>
        <span>本地优先模式 · 标注自动写入浏览器存储</span>
        <span>会话变更持续自动保存</span>
      </Box>
    </Box>
  );
}
