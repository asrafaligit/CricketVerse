import {
  BrowserRouter as Router,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  ArrowLeft,
  House,
  NewspaperClipping,
  Target,
} from "@phosphor-icons/react";
import "./App.css";
import MatchDetails from "./components/MatchDetails";
import NewsPanel from "./components/NewsPanel";
import ScoreBoard from "./components/ScoreBoard";
import TossDecisionAdvisor from "./components/TossDecisionAdvisor";

const navItems = [
  { to: "/", label: "Home", icon: House, end: true },
  { to: "/news", label: "News", icon: NewspaperClipping },
  { to: "/toss-decision", label: "Toss Advisor", icon: Target },
];

const Layout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <div className="app-shell">
      <header className="top-shell">
        <div className="brand-row">
          {!isHome && (
            <button
              type="button"
              className="back-button"
              onClick={() => navigate(-1)}
              aria-label="Go back"
              title="Go back"
            >
              <ArrowLeft size={21} weight="bold" />
            </button>
          )}
          <img src="/CricketVerse_logo.png" alt="CricketVerse" className="brand-logo" />
          <span className="brand-title">
            Cricket<span>Verse</span>
          </span>
        </div>

        <nav className="pill-nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `pill-link ${isActive ? "pill-link--active" : ""}`}
              >
                <Icon size={20} weight="fill" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
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
        <Route path="/news" element={<NewsPanel />} />
        <Route path="/toss-decision" element={<TossDecisionAdvisor />} />
      </Routes>
    </Layout>
  </Router>
);

export default App;
