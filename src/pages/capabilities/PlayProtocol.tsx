import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function PlayProtocol() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const url = searchParams.get('url');
    console.log('Protocol handler triggered with URL:', url);
    // Handle protocol play logic here
    navigate('/');
  }, [searchParams, navigate]);

  return <div>Playing via protocol...</div>;
}
