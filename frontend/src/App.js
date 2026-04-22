import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import "./App.css";
import MatchDetails from "./components/MatchDetails";
import ScoreBoard from "./components/ScoreBoard";
import TossDecisionAdvisor from "./components/TossDecisionAdvisor";

const Layout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <div className="app-shell">
      <div className="app-shell__glow app-shell__glow--one" />
      <div className="app-shell__glow app-shell__glow--two" />

      <header className="app-header">
        <div className="brand-block">
          {!isHome && (
            <button className="ghost-button" onClick={() => navigate(-1)}>
              Back
            </button>
          )}
          <img src="/CricketVerse_logo.png" alt="CricketVerse" className="brand-logo" />
          <div>
            <p className="brand-kicker">Live match intelligence</p>
            <h1 className="brand-title">
              Cricket<span>Verse</span>
            </h1>
          </div>
        </div>

        <button
          className="primary-button"
          onClick={() => navigate("/toss-decision")}
        >
          Toss Advisor
        </button>
      </header>

      <main className="app-content">{children}</main>
    </div>
  );
};

const App = () => (
  <Router>
    <Layout>
      <Routes>
        <Route path="/" element={<ScoreBoard />} />
        <Route path="/match/:id" element={<MatchDetails />} />
        <Route path="/toss-decision" element={<TossDecisionAdvisor />} />
      </Routes>
    </Layout>
  </Router>
);

export default App;
