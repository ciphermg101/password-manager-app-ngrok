import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from './axiosInstance';
import axios from 'axios';

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true; // Track if component is still mounted

    const checkAuth = async () => {
      try {
        // Send request to check authentication
        const response = await axiosInstance.get('/account/check-auth', {
          withCredentials: true,
        });

        if (!isMounted) return;

        if (response.status === 200) {
          // User authenticated for login purpose
          setIsAuthenticated(true);
        } else if (response.status === 203) {
          // User authenticated for 2FA purpose
          navigate('/enter-two-fa-code');
        } else {
          // Any unexpected response leads to redirection
          console.error('Unexpected response:', response);
          setIsAuthenticated(false);
          navigate('/login');
        }
      } catch (error) {
        if (!isMounted) return;

        if (axios.isAxiosError(error)) {
          const status = error.response?.status;

          switch (status) {
            case 498:
              console.error('Token expired or invalid.');
              break;
            case 401:
              console.error('Unauthorized access.');
              break;
            default:
              console.error('Unexpected error:', error.response?.data || error.message);
          }
        } else {
          console.error('Unexpected error:', error);
        }

        setIsAuthenticated(false);
        navigate('/login');
      }
    };

    checkAuth();

    return () => {
      isMounted = false; // Cleanup flag on unmount
    };
  }, [navigate]);

  // Show loading state until authentication is determined
  if (isAuthenticated === null) return <div>Loading...</div>;

  return isAuthenticated ? <>{children}</> : null;
};

export default PrivateRoute;
