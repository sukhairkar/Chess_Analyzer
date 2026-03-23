<div align="center">
  <img src="https://raw.githubusercontent.com/sukhairkar/Chess_Analyzer/main/public/logo.png" alt="Chess Analyzer Logo" width="120" style="border-radius: 20px; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2); margin-bottom: 20px;" onerror="this.style.display='none'">
  
  # ♟️ Chess Analyzer Pro
  
  **A full-stack, real-time chess analysis platform powered by Next.js, FastAPI, and Stockfish.**
  
  [![Made by sukhairkar](https://img.shields.io/badge/Made%20by-sukhairkar-blue?style=for-the-badge&logo=github)](https://github.com/sukhairkar)
  [![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white)]()
  [![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)]()
  [![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)]()
  [![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)]()
  
  [Report Bug](https://github.com/sukhairkar/Chess_Analyzer/issues) • [Request Feature](https://github.com/sukhairkar/Chess_Analyzer/issues)

</div>

---

## ✨ Features

- **🧠 Deep Engine Analysis:** Harness the power of Stockfish 16.1 for instant, accurate evaluations.
- **⚡ Real-time WebSockets:** Fluid, real-time engine evaluation and move analysis transmitted instantly to the frontend.
- **👁️ Interactive UI:** Drag-and-drop piece manipulation, interactive move lists, and a sleek dark-mode glassmorphism design.
- **📊 Evaluation Bar:** Visual win probability indicator dynamically mapped to Stockfish's mate constraints and centipawn scoring.
- **📖 PGN Import:** Instantly load and analyze entire games with blunder, mistake, and excellent move classifications.
- **📚 Master Database (ECO):** Detects and names chess openings dynamically using a comprehensive ECO database verification.
- **🔄 Smart Orientation:** The avatar and player information automatically adapt when you flip the board!

## 🛠️ Technology Stack

### Frontend
- **Framework:** Next.js 16 (React)
- **Styling:** Tailwind CSS (with highly customized utility classes)
- **Chess Logic:** `chess.js` & `react-chessboard`
- **Communication:** Native WebSockets & HTTP fetch

### Backend
- **Framework:** FastAPI (Python)
- **Chess Logic:** `python-chess`
- **Engine:** Built-in Stockfish executable
- **Communication:** Uvicorn Async Server

---

## 🚀 Getting Started

Follow these steps to set up the project locally.

### Prerequisites

- Node.js 18.x or later
- Python 3.8 or later
- Ensure you have [Git](https://git-scm.com/) installed.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/sukhairkar/Chess_Analyzer.git
   cd Chess_Analyzer
   ```

2. **Set up the Backend:**
   ```bash
   cd backend
   # Create a virtual environment
   python -m venv venv
   
   # Activate the virtual environment
   # Windows:
   .\venv\Scripts\activate
   # macOS/Linux:
   source venv/bin/activate
   
   # Install dependencies
   pip install -r requirements.txt
   
   # Start the FastAPI server (runs on port 8000)
   python -m uvicorn main:app --reload --port 8000
   ```

3. **Set up the Frontend:**
   Open a new terminal session and navigate to the frontend directory:
   ```bash
   cd frontend
   
   # Install dependencies
   npm install
   
   # Start the development server (runs on port 3000)
   npm run dev
   ```

4. **Experience the App:**
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📸 Overview

The interface features an incredibly premium aesthetic matching top-tier chess platforms. It includes customized player avatars, a sleek eval bar, and dedicated panels for Engine Depth tracking and PGN importing.
*(Consider dropping a screenshot of your app here!)*

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/sukhairkar/Chess_Analyzer/issues).

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 👤 Author

**sukhairkar**
- GitHub: [@sukhairkar](https://github.com/sukhairkar)

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
