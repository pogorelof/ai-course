import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './App.css'
import { Header } from './components/Header'
import { useAuth } from './hooks/useAuth'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { NewCoursePage } from './pages/NewCoursePage'
import { CoursePage } from './pages/CoursePage'
import { TopicPage } from './pages/TopicPage'

export default function App() {
  const { auth, login, logout } = useAuth()
  return (
    <div className="app-shell">
      <BrowserRouter>
        <Header auth={auth} onLogout={logout} />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage onLogin={login} />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/new" element={<NewCoursePage />} />
          <Route path="/courses/:courseId" element={<CoursePage />} />
          <Route path="/topics/:topicId" element={<TopicPage />} />
        </Routes>
      </BrowserRouter>
    </div>
  )
}
