import './App.css';
import ClockBlock from './ClockBlock';
import WeatherBlock from './WeatherBlock';
import TimeUntilBlock from './TimeUntilBlock';
import WeatherForecastBlock from './WeatherForecastBlock';
import ComputerStatsBlock from './ComputerStatsBlock';

const styles = {
    clock: { position: "absolute" as const, left: 20, top: 20 },
    timeUntil: { position: "absolute" as const, left: 600, top: 20 },
    forecast: { position: "absolute" as const, left: 0, top: 240 },
    stats: { position: "absolute" as const, left: 600, top: 220 },
    weather: { position: "absolute" as const, left: 300, top: 20 },
} as const;

function App() {
    return (
        <div className="box">
            <div style={styles.clock}>
                <ClockBlock />
            </div>
            <div style={styles.timeUntil}>
                <TimeUntilBlock />
            </div>
            <div style={styles.forecast}>
                <WeatherForecastBlock />
            </div>
            <div style={styles.stats}>
                <ComputerStatsBlock />
            </div>
            <div style={styles.weather}>
                <WeatherBlock />
            </div>
        </div>
    );
}

export default App;
