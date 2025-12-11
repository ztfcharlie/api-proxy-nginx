import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ClientTest from './pages/ClientTest';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/client-test" replace />} />
        <Route path="/client-test" element={<ClientTest />} />
      </Routes>
    </Router>
  );
}

export default App;