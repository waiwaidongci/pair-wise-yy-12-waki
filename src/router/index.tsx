import { createHashRouter, Navigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import AnnotatePage from "../pages/AnnotatePage";
import ReviewPage from "../pages/ReviewPage";

export const router = createHashRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/annotate" replace /> },
      { path: "annotate", element: <AnnotatePage /> },
      { path: "review", element: <ReviewPage /> },
    ],
  },
  { path: "*", element: <Navigate to="/annotate" replace /> },
]);
