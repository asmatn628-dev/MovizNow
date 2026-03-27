import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function OpenFile() {
  const navigate = useNavigate();

  useEffect(() => {
    // Handle file opening logic here
    console.log('File handler triggered');
    navigate('/');
  }, [navigate]);

  return <div>Opening file...</div>;
}
