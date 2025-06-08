import React from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const WicketsChart = ({ data }) => {
  const chartData = {
    labels: ["Team 1", "Team 2"],
    datasets: [
      {
        label: "Wickets Taken",
        data: [data.team1, data.team2],
        backgroundColor: ["rgba(3, 218, 198, 0.6)", "rgba(207, 102, 121, 0.6)"],
        borderColor: ["rgba(3, 218, 198, 1)", "rgba(207, 102, 121, 1)"],
        borderWidth: 1,
        borderRadius: 5,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: "top",
        labels: {
          color: "#e0e0e0",
          font: {
            family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
          },
        },
      },
      title: {
        display: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 10,
        grid: {
          color: "rgba(255, 255, 255, 0.1)",
        },
        ticks: {
          color: "#e0e0e0",
          font: {
            family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
          },
        },
      },
      x: {
        grid: {
          color: "rgba(255, 255, 255, 0.1)",
        },
        ticks: {
          color: "#e0e0e0",
          font: {
            family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
          },
        },
      },
    },
  };

  const containerStyle = {
    backgroundColor: "#1e1e1e",
    borderRadius: "15px",
    padding: "1.5rem",
    boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
    transition: "transform 0.3s ease",
  };

  const titleStyle = {
    fontSize: "1.5rem",
    fontWeight: "semibold",
    marginBottom: "1rem",
    textAlign: "center",
    color: "#bb86fc",
  };

  return (
    <div style={containerStyle}>
      <h2 style={titleStyle}>Wickets Taken</h2>
      <Bar data={chartData} options={options} />
    </div>
  );
};

export default WicketsChart;
