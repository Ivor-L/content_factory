/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Generate from './pages/Generate';
import Warehouse from './pages/Warehouse';
import Records from './pages/Records';
import Profile from './pages/Profile';
import Content from './pages/Content';
import { UserProvider } from './contexts/UserContext';

export default function App() {
  return (
    <UserProvider>
      <BrowserRouter>
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
      </BrowserRouter>
    </UserProvider>
  );
}
