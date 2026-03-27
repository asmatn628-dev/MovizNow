import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function NewNote() {
  const navigate = useNavigate();

  useEffect(() => {
    // Handle new note logic here
    console.log('New note triggered');
    navigate('/');
  }, [navigate]);

  return <div>Creating new note...</div>;
}
