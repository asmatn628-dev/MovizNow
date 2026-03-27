import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function ShareTarget() {
  const navigate = useNavigate();

  useEffect(() => {
    // Handle share target logic here
    console.log('Share target triggered');
    navigate('/');
  }, [navigate]);

  return <div>Handling share...</div>;
}
