import * as React from "react";
import "./App.css";
import ClockBlock from "./ClockBlock";
import WeatherBlock from "./WeatherBlock";
import TimeUntilBlock from "./TimeUntilBlock";
import WeatherForecastBlock from "./WeatherForecastBlock";
import ComputerStatsBlock from "./ComputerStatsBlock";

function App() {
    return (
        <div className="box">
            <div style={{ position: "absolute", left: 20, top: 20 }}>
                <ClockBlock />
            </div>
            <div style={{ position: "absolute", left: 600, top: 20 }}>
                <TimeUntilBlock />
            </div>
            <div style={{ position: "absolute", left: 0, top: 320 - 80 }}>
                <WeatherForecastBlock />
            </div>
            <div style={{ position: "absolute", left: 600, top: 320 - 100 }}>
                <ComputerStatsBlock />
            </div>
            <div style={{ position: "absolute", left: 300, top: 20 }}>
                <WeatherBlock />
            </div>

            {/* <div className="l1t1 w4h1">
                <HwInfoBlock />
            </div>
            <div className="l1t2 w4h1">
                <PingBlock />
            </div>
            <div className="l1t3 w4h3">
                <SynologyRouterBlock />
            </div>
*/}

            {/*<div className="l1t3 w8h1" style={{ marginTop: 20 }}>
                <WeatherForecastBlock />
            </div>
            <div className="l1t1 w4h2">
            </div>
            <div className="l1t4 w8h4" style={{ marginTop: 25, height: 415 }}>
                <TimeUntilBlock />
            </div>
            {/* <div onClick={reload} style={{ position: "absolute", right: 0, top: 0, width: 60, height: 60, textAlign: "center", fontSize: 40, opacity: 0.6, lineHeight: "60px" }}>
                <FontAwesomeIcon icon={faSyncAlt} />
            </div> 
            <div className="l5t1 w4h2" style={{ marginTop: 40 }}>
                <WeatherBlock />
            </div> */}

            {/* <div onClick={reload} style={{ position: "fixed", left: 0, bottom: 0, top: 0, right: 0, backgroundColor: "black", opacity: 0.01 }}>
            </div> */}
        </div>
    );
}

export default App;
