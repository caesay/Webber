import './App.css';
import ClockBlock from './ClockBlock';
import WeatherBlock from './WeatherBlock';
import TimeUntilBlock from './TimeUntilBlock';
import WeatherForecastBlock from './WeatherForecastBlock';
import ComputerStatsBlock from './ComputerStatsBlock';

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
        </div>
    );
}

export default App;
