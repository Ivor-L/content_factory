import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import NexApi from './pages/NexApi';
import NexApiConsole from './pages/NexApiConsole';
import OpenClaw from './pages/OpenClaw';
import InfiniteCanvas from './pages/InfiniteCanvas';

export default function App() {
  return (
    <Router>
      <div className="flex min-h-screen flex-col bg-[#050505] text-white">
        <Navbar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/nexapi" element={<NexApi />} />
            <Route path="/nexapi/console" element={<NexApiConsole />} />
            <Route path="/openclaw" element={<OpenClaw />} />
            <Route path="/canvas" element={<InfiniteCanvas />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  );
}
