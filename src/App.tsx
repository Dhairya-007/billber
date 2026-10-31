import { useLiveQuery } from "dexie-react-hooks";
import { Route, Routes, useLocation } from "react-router-dom";
import { ToastProvider } from "./components/ui";
import { getMe } from "./repo";
import { Balances } from "./screens/Balances";
import { GroupScreen } from "./screens/Group";
import { Home } from "./screens/Home";
import { Settings } from "./screens/Settings";
import { Setup } from "./screens/Setup";
import { SharedView } from "./screens/SharedView";

export function App() {
  const { pathname } = useLocation();
  const me = useLiveQuery(async () => (await getMe()) ?? null, []);
  const shared = pathname === "/s";

  return (
    <ToastProvider>
      <div className="mx-auto min-h-dvh max-w-[460px] bg-white">
        {shared ? <SharedView /> : me === undefined ? null : me === null ? <Setup /> : (
          <Routes>
            <Route path="/" element={<Home me={me} />} />
            <Route path="/g/:id" element={<GroupScreen me={me} />} />
            <Route path="/g/:id/balances" element={<Balances />} />
            <Route path="/settings" element={<Settings me={me} />} />
            <Route path="*" element={<Home me={me} />} />
          </Routes>
        )}
      </div>
    </ToastProvider>
  );
}
