import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SettingsProvider } from "@/context/SettingsContext";
import { PlaybackProvider } from "@/context/PlaybackContext";
import StickyAudioPlayer from "@/components/StickyAudioPlayer";
import { Toaster } from "@/components/ui/sonner";
import Home from "@/pages/Home";
import Reader from "@/pages/Reader";
import ReciteAlong from "@/pages/ReciteAlong";
import MemorizeReveal from "@/pages/MemorizeReveal";
import MemorizeLobby from "@/pages/MemorizeLobby";
import MushafReader from "@/pages/MushafReader";
import Dashboard from "@/pages/Dashboard";
import GroupLobby from "@/pages/GroupLobby";
import GroupRoom from "@/pages/GroupRoom";
import TeacherPortal from "@/pages/TeacherPortal";
import TeacherDashboard from "@/pages/TeacherDashboard";
import TeacherClass from "@/pages/TeacherClass";
import TeacherStudent from "@/pages/TeacherStudent";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import LearnerPortal from "@/pages/LearnerPortal";
import Explore from "@/pages/Explore";

function App() {
  return (
    <div className="App parchment min-h-screen">
      <SettingsProvider>
        <BrowserRouter>
          <PlaybackProvider>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/surah/:number" element={<Reader />} />
              <Route path="/surah/:number/along" element={<ReciteAlong />} />
              <Route path="/surah/:number/memorize" element={<MemorizeReveal />} />
              <Route path="/memorize" element={<MemorizeLobby />} />
              <Route path="/mushaf/:page" element={<MushafReader />} />
              <Route path="/mushaf" element={<MushafReader />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/account" element={<LearnerPortal />} />
              <Route path="/explore" element={<Explore />} />
              <Route path="/group" element={<GroupLobby />} />
              <Route path="/group/:code" element={<GroupRoom />} />
              <Route path="/teacher" element={<TeacherPortal />} />
              <Route path="/teacher/dashboard" element={<TeacherDashboard />} />
              <Route path="/teacher/class/:code" element={<TeacherClass />} />
              <Route path="/teacher/class/:code/student/:userId" element={<TeacherStudent />} />
              <Route path="/teacher/forgot" element={<ForgotPassword />} />
              <Route path="/teacher/reset" element={<ResetPassword />} />
            </Routes>
            <StickyAudioPlayer />
          </PlaybackProvider>
        </BrowserRouter>
        <Toaster position="top-center" richColors />
      </SettingsProvider>
    </div>
  );
}

export default App;
