import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { DebugBlockProvider } from "./blocks/DebugBlock";
import { PingBlockProvider } from "./blocks/PingBlock";
import { RainCloudBlockProvider } from "./blocks/RainCloudBlock";
import { ReloadBlockProvider } from "./blocks/ReloadBlock";
import { RemilkBlockProvider } from "./blocks/RemilkBlock";
import { RouterBlockProvider } from "./blocks/RouterBlock";
import { TimeUntilBlockProvider } from "./blocks/TimeUntilBlock";
import { WeatherBlockProvider } from "./blocks/WeatherBlock";
import { WeatherDotComBlockProvider } from "./blocks/WeatherDotComBlock";
import { WeatherForecastBlockProvider } from "./blocks/WeatherForecastBlock";
import { GlobalStyle } from "./style";
import { installGlobalErrorHandlers } from "./util/errorBus";
import { TimeProvider } from "./util/useTime";

installGlobalErrorHandlers();

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <GlobalStyle />
        <DebugBlockProvider><TimeProvider><ReloadBlockProvider><PingBlockProvider><RouterBlockProvider><WeatherBlockProvider><WeatherForecastBlockProvider><TimeUntilBlockProvider><RemilkBlockProvider><RainCloudBlockProvider><WeatherDotComBlockProvider>
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </WeatherDotComBlockProvider></RainCloudBlockProvider></RemilkBlockProvider></TimeUntilBlockProvider></WeatherForecastBlockProvider></WeatherBlockProvider></RouterBlockProvider></PingBlockProvider></ReloadBlockProvider></TimeProvider></DebugBlockProvider>
    </React.StrictMode>
);
