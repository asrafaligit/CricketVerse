import React, { useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useNavigate,
  useLocation,
} from "react-router-dom";
import ScoreBoard from "./components/ScoreBoard";
import MatchDetails from "./components/MatchDetails";
import TossDecisionAdvisor from "./components/TossDecisionAdvisor";

const App = () => {
  const [currentMatch, setCurrentMatch] = useState(null);

  return (
    <Router>
      <Layout>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <ScoreBoard onCurrentMatchChange={setCurrentMatch} />
                <div style={styles.chartsContainer}></div>
              </>
            }
          />
          <Route path="/match/:id" element={<MatchDetails />} />
          <Route path="/toss-decision" element={<TossDecisionAdvisor />} />
        </Routes>
      </Layout>
    </Router>
  );
};

// ✅ Header / Layout Wrapper Component
const Layout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const showBack = location.pathname !== "/";

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.leftGroup}>
          {showBack && (
            <button onClick={() => navigate(-1)} style={styles.backButton}>
              <img src="/back.gif" alt="Logo" />
            </button>
          )}
          <img src="/logo1.jpg" alt="Logo" style={styles.logo} />
          <h1 style={styles.title}>
            <span style={styles.titleAccent}>Cricket</span>Verse
          </h1>
        </div>
        <button
          style={styles.advisorButton}
          onClick={() => navigate("/toss-decision")}
        >
          🧠 Toss Decision Recommendation
        </button>
      </header>
      {children}
    </div>
  );
};

// ✅ Styles
const styles = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#121212",
    color: "#e0e0e0",
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    padding: "2rem",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "2rem",
    borderBottom: "1px solid #333",
    paddingBottom: "1rem",
  },
  leftGroup: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
  },
  logo: {
    width: "50px",
    height: "50px",
    borderRadius: "50%",
    objectFit: "cover",
    boxShadow: "0 0 10px rgba(0, 255, 255, 0.2)",
  },
  title: {
    fontSize: "2.8rem",
    fontWeight: "bold",
    color: "#e0e0e0",
    letterSpacing: "1.5px",
  },
  titleAccent: {
    color: "#bb86fc",
  },
  backButton: {
    backgroundColor: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  backIcon: {
    width: "42px",
    height: "42px",
    borderRadius: "50%",
    objectFit: "cover",
    boxShadow: "0 0 6px rgba(255, 255, 255, 0.15)",
    transition: "transform 0.2s ease-in-out",
    backgroundColor: "#121212", // Prevents white border in gif with transparency
    border: "2px solid #03dac6", // Optional: stylish border to fit theme
  },

  advisorButton: {
    padding: "0.8rem 1.5rem",
    fontSize: "1.2rem",
    backgroundColor: "#03dac6",
    color: "#121212",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "bold",
    boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
    transition: "background 0.3s",
  },
  chartsContainer: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: "2rem",
    marginTop: "2rem",
  },
};

export default App;
