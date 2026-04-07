import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Generate from './pages/Generate';
import Warehouse from './pages/Warehouse';
import Records from './pages/Records';
import Profile from './pages/Profile';
import Content from './pages/Content';
import Login from './pages/Login';
import { UserProvider, useUser } from './contexts/UserContext';

function ProtectedRoutes() {
  const { isLoggedIn, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5]">
        <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Route path="/" element={<Layout />}>
      <Route index element={<Home />} />
      <Route path="generate" element={<Generate />} />
      <Route path="warehouse" element={<Warehouse />} />
      <Route path="records" element={<Records />} />
      <Route path="content" element={<Content />} />
      <Route path="profile" element={<Profile />} />
    </Route>
  );
}

export default function App() {
  return (
    <UserProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginGuard />} />
          <Route path="/*" element={<AuthGuard />} />
        </Routes>
      </BrowserRouter>
    </UserProvider>
  );
}

function LoginGuard() {
  const { isLoggedIn, isLoading } = useUser();
  if (isLoading) return null;
  if (isLoggedIn) return <Navigate to="/" replace />;
  return <Login />;
}

function AuthGuard() {
  const { isLoggedIn, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5]">
        <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isLoggedIn) return <Navigate to="/login" replace />;

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="generate" element={<Generate />} />
        <Route path="warehouse" element={<Warehouse />} />
        <Route path="records" element={<Records />} />
        <Route path="content" element={<Content />} />
        <Route path="profile" element={<Profile />} />
      </Route>
    </Routes>
  );
}
