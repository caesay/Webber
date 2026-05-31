import { useEffect, useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useReloadBlock } from "./blocks/ReloadBlock";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ErrorToast } from "./components/ErrorToast";
import { ClassicPage } from "./pages/ClassicPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ExperimentsPage } from "./pages/ExperimentsPage";
import { WeatherPage } from "./pages/WeatherPage";

export function App(): React.ReactNode {
    const reload = useReloadBlock();
    const [prevHash, setPrevHash] = useState(reload.dto?.serverHash);
    const navigate = useNavigate();
    const loc = useLocation();
    useEffect(() => {
        if (prevHash && prevHash != reload.dto?.serverHash) {
            location.reload();
        }
        setPrevHash(reload.dto?.serverHash); // save the initial hash on first update

        if (!window.parent.document.getElementById("appframe")) {
            // redirect to the wrapper if not wrapped
            window.location.replace("/wrapper.html" + (window.location.pathname === "/" ? "" : `#${window.location.pathname}`));
        } else {
            // navigate to the hash if it doesn't match curret route
            const hash = window.parent.location.hash.substring(1);
            if (loc.pathname !== hash)
                void navigate(hash);
        }
    }, [reload.dto?.serverHash]);

    return (
        <>
            <ErrorBoundary>
                <Routes>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/classic" element={<ClassicPage />} />
                    <Route path="/weather" element={<WeatherPage />} />
                    <Route path="/experiments" element={<ExperimentsPage />} />
                    <Route path="*" element={<p>Page Not Found</p>} />
                </Routes>
            </ErrorBoundary>
            <ErrorToast />
        </>
    );
}
