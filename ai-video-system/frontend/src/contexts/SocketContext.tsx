import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  error: string | null;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      // Disconnect socket if user is not authenticated
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    const socketURL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';
    const newSocket = io(socketURL, {
      auth: {
        userId: user.id,
        token: localStorage.getItem('token'),
      },
      transports: ['websocket', 'polling'],
      timeout: 20000,
    });

    newSocket.on('connect', () => {
      console.log('Socket connected');
      setIsConnected(true);
      setError(null);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      setIsConnected(false);
      
      if (reason === 'io server disconnect') {
        // Server disconnected, don't try to reconnect automatically
        newSocket.disconnect();
      }
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setError(error.message);
      setIsConnected(false);
    });

    // Join user's personal room for notifications
    newSocket.emit('join_user_room', { userId: user.id });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [isAuthenticated, user]);

  const value: SocketContextType = {
    socket,
    isConnected,
    error,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = (): SocketContextType => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

// Socket event hooks for specific features
export const useCollaborationSocket = (projectId: string) => {
  const { socket } = useSocket();
  const [collaborators, setCollaborators] = useState<any[]>([]);

  useEffect(() => {
    if (!socket || !projectId) return;

    // Join project room
    socket.emit('join_project', { projectId });

    // Listen for collaboration events
    const handleUserJoined = (data: any) => {
      setCollaborators(prev => [...prev, data.user]);
    };

    const handleUserLeft = (data: any) => {
      setCollaborators(prev => prev.filter(user => user.id !== data.userId));
    };

    const handleProjectUpdate = (data: any) => {
      // Handle project updates from other users
      console.log('Project updated:', data);
    };

    const handleCursorMove = (data: any) => {
      // Handle cursor movement from other users
      console.log('Cursor moved:', data);
    };

    socket.on('user_joined', handleUserJoined);
    socket.on('user_left', handleUserLeft);
    socket.on('project_updated', handleProjectUpdate);
    socket.on('cursor_moved', handleCursorMove);

    return () => {
      socket.off('user_joined', handleUserJoined);
      socket.off('user_left', handleUserLeft);
      socket.off('project_updated', handleProjectUpdate);
      socket.off('cursor_moved', handleCursorMove);
      socket.emit('leave_project', { projectId });
    };
  }, [socket, projectId]);

  const broadcastUpdate = (update: any) => {
    if (socket && projectId) {
      socket.emit('project_update', { projectId, update });
    }
  };

  const broadcastCursorMove = (position: { x: number; y: number }) => {
    if (socket && projectId) {
      socket.emit('cursor_move', { projectId, position });
    }
  };

  return {
    collaborators,
    broadcastUpdate,
    broadcastCursorMove,
  };
};

export const useRenderProgressSocket = () => {
  const { socket } = useSocket();
  const [renderJobs, setRenderJobs] = useState<any[]>([]);

  useEffect(() => {
    if (!socket) return;

    const handleRenderProgress = (data: any) => {
      setRenderJobs(prev => {
        const index = prev.findIndex(job => job.id === data.jobId);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = { ...updated[index], ...data };
          return updated;
        }
        return [...prev, data];
      });
    };

    const handleRenderComplete = (data: any) => {
      setRenderJobs(prev => 
        prev.map(job => 
          job.id === data.jobId 
            ? { ...job, status: 'completed', resultUrl: data.resultUrl }
            : job
        )
      );
    };

    const handleRenderError = (data: any) => {
      setRenderJobs(prev => 
        prev.map(job => 
          job.id === data.jobId 
            ? { ...job, status: 'failed', error: data.error }
            : job
        )
      );
    };

    socket.on('render_progress', handleRenderProgress);
    socket.on('render_complete', handleRenderComplete);
    socket.on('render_error', handleRenderError);

    return () => {
      socket.off('render_progress', handleRenderProgress);
      socket.off('render_complete', handleRenderComplete);
      socket.off('render_error', handleRenderError);
    };
  }, [socket]);

  const subscribeToJob = (jobId: string) => {
    if (socket) {
      socket.emit('subscribe_render', { jobId });
    }
  };

  const unsubscribeFromJob = (jobId: string) => {
    if (socket) {
      socket.emit('unsubscribe_render', { jobId });
    }
  };

  return {
    renderJobs,
    subscribeToJob,
    unsubscribeFromJob,
  };
};

export const useNotificationSocket = () => {
  const { socket } = useSocket();
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    if (!socket) return;

    const handleNotification = (data: any) => {
      setNotifications(prev => [data, ...prev]);
      
      // Show toast notification
      if (data.type === 'success') {
        toast.success(data.message);
      } else if (data.type === 'error') {
        toast.error(data.message);
      } else {
        toast(data.message);
      }
    };

    const handleInviteReceived = (data: any) => {
      setNotifications(prev => [{ ...data, type: 'invite' }, ...prev]);
      toast(`You've been invited to collaborate on ${data.projectName}`);
    };

    const handleInviteAccepted = (data: any) => {
      setNotifications(prev => [{ ...data, type: 'invite_accepted' }, ...prev]);
      toast(`${data.userName} accepted your invitation`);
    };

    socket.on('notification', handleNotification);
    socket.on('invite_received', handleInviteReceived);
    socket.on('invite_accepted', handleInviteAccepted);

    return () => {
      socket.off('notification', handleNotification);
      socket.off('invite_received', handleInviteReceived);
      socket.off('invite_accepted', handleInviteAccepted);
    };
  }, [socket]);

  const markNotificationRead = (notificationId: string) => {
    setNotifications(prev => 
      prev.map(notif => 
        notif.id === notificationId 
          ? { ...notif, read: true }
          : notif
      )
    );
    
    if (socket) {
      socket.emit('mark_notification_read', { notificationId });
    }
  };

  const clearNotifications = () => {
    setNotifications([]);
    
    if (socket) {
      socket.emit('clear_notifications');
    }
  };

  return {
    notifications,
    markNotificationRead,
    clearNotifications,
  };
};

export default SocketContext;