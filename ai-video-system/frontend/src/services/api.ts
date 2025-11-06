import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import toast from 'react-hot-toast';

// Create axios instance with default configuration
const createAPIInstance = (): AxiosInstance => {
  const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const instance = axios.create({
    baseURL,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Request interceptor to add auth token
  instance.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // Response interceptor for error handling
  instance.interceptors.response.use(
    (response) => {
      return response;
    },
    async (error) => {
      const originalRequest = error.config;

      // Handle 401 Unauthorized errors
      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;

        try {
          // Try to refresh the token
          const response = await axios.post(`${baseURL}/api/auth/refresh`, {}, {
            headers: {
              Authorization: `Bearer ${localStorage.getItem('token')}`,
            },
          });

          const { token } = response.data.data;
          localStorage.setItem('token', token);

          // Retry the original request with new token
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return instance(originalRequest);
        } catch (refreshError) {
          // Refresh failed, logout user
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = '/';
          return Promise.reject(refreshError);
        }
      }

      // Handle other errors
      const errorMessage = error.response?.data?.message || error.message || 'An error occurred';
      
      if (error.response?.status >= 500) {
        toast.error('Server error. Please try again later.');
      } else if (error.response?.status === 429) {
        toast.error('Too many requests. Please try again later.');
      } else if (error.response?.status !== 401) {
        toast.error(errorMessage);
      }

      return Promise.reject(error);
    }
  );

  return instance;
};

const api = createAPIInstance();

// Generic API methods
export const apiRequest = {
  get: <T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> =>
    api.get(url, config),
    
  post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> =>
    api.post(url, data, config),
    
  put: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> =>
    api.put(url, data, config),
    
  patch: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> =>
    api.patch(url, data, config),
    
  delete: <T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> =>
    api.delete(url, config),
};

// Authentication API
export const authAPI = {
  login: (credentials: { email: string; password: string }) =>
    apiRequest.post('/auth/login', credentials),
    
  register: (data: { email: string; password: string; name: string }) =>
    apiRequest.post('/auth/register', data),
    
  logout: () =>
    apiRequest.post('/auth/logout'),
    
  refreshToken: () =>
    apiRequest.post('/auth/refresh'),
    
  verifyEmail: (token: string) =>
    apiRequest.post('/auth/verify-email', { token }),
    
  forgotPassword: (email: string) =>
    apiRequest.post('/auth/forgot-password', { email }),
    
  resetPassword: (token: string, password: string) =>
    apiRequest.post('/auth/reset-password', { token, password }),
};

// User API
export const userAPI = {
  getProfile: () =>
    apiRequest.get('/users/profile'),
    
  updateProfile: (data: any) =>
    apiRequest.put('/users/profile', data),
    
  uploadAvatar: (file: File) => {
    const formData = new FormData();
    formData.append('avatar', file);
    return apiRequest.post('/users/avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
    
  getPreferences: () =>
    apiRequest.get('/users/preferences'),
    
  updatePreferences: (data: any) =>
    apiRequest.put('/users/preferences', data),
    
  getUsageStats: (period: string = 'monthly') =>
    apiRequest.get(`/users/usage?period=${period}`),
    
  getSessions: () =>
    apiRequest.get('/users/sessions'),
    
  deleteSession: (sessionId: string) =>
    apiRequest.delete(`/users/sessions/${sessionId}`),
};

// Projects API
export const projectAPI = {
  getProjects: (page = 1, limit = 10) =>
    apiRequest.get(`/projects?page=${page}&limit=${limit}`),
    
  getProject: (id: string) =>
    apiRequest.get(`/projects/${id}`),
    
  createProject: (data: any) =>
    apiRequest.post('/projects', data),
    
  updateProject: (id: string, data: any) =>
    apiRequest.put(`/projects/${id}`, data),
    
  deleteProject: (id: string) =>
    apiRequest.delete(`/projects/${id}`),
    
  duplicateProject: (id: string) =>
    apiRequest.post(`/projects/${id}/duplicate`),
    
  shareProject: (id: string, data: any) =>
    apiRequest.post(`/projects/${id}/share`, data),
    
  getSharedProjects: () =>
    apiRequest.get('/projects/shared'),
};

// Assets API
export const assetAPI = {
  getAssets: (projectId?: string, type?: string) => {
    const params = new URLSearchParams();
    if (projectId) params.append('projectId', projectId);
    if (type) params.append('type', type);
    return apiRequest.get(`/assets?${params.toString()}`);
  },
    
  getAsset: (id: string) =>
    apiRequest.get(`/assets/${id}`),
    
  uploadAsset: (file: File, projectId?: string) => {
    const formData = new FormData();
    formData.append('asset', file);
    if (projectId) formData.append('projectId', projectId);
    return apiRequest.post('/assets', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
    
  updateAsset: (id: string, data: any) =>
    apiRequest.put(`/assets/${id}`, data),
    
  deleteAsset: (id: string) =>
    apiRequest.delete(`/assets/${id}`),
};

// Render API
export const renderAPI = {
  startRender: (projectId: string, settings: any) =>
    apiRequest.post('/render/start', { projectId, settings }),
    
  getRenderStatus: (jobId: string) =>
    apiRequest.get(`/render/status/${jobId}`),
    
  cancelRender: (jobId: string) =>
    apiRequest.post(`/render/cancel/${jobId}`),
    
  getRenderHistory: (projectId?: string) => {
    const params = projectId ? `?projectId=${projectId}` : '';
    return apiRequest.get(`/render/history${params}`);
  },
};

// Templates API
export const templateAPI = {
  getTemplates: (category?: string, page = 1, limit = 12) => {
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    return apiRequest.get(`/templates?${params.toString()}`);
  },
    
  getTemplate: (id: string) =>
    apiRequest.get(`/templates/${id}`),
    
  createTemplate: (data: any) =>
    apiRequest.post('/templates', data),
    
  updateTemplate: (id: string, data: any) =>
    apiRequest.put(`/templates/${id}`, data),
    
  deleteTemplate: (id: string) =>
    apiRequest.delete(`/templates/${id}`),
    
  useTemplate: (templateId: string, projectName: string) =>
    apiRequest.post('/templates/use', { templateId, projectName }),
};

// Analytics API
export const analyticsAPI = {
  getAnalytics: (period: string = 'monthly') =>
    apiRequest.get(`/analytics?period=${period}`),
    
  trackEvent: (event: string, data: any) =>
    apiRequest.post('/analytics/events', { event, data }),
    
  getProjectAnalytics: (projectId: string) =>
    apiRequest.get(`/analytics/projects/${projectId}`),
};

// Subscription API
export const subscriptionAPI = {
  getSubscription: () =>
    apiRequest.get('/subscriptions/current'),
    
  updateSubscription: (tier: string) =>
    apiRequest.post('/subscriptions/update', { tier }),
    
  cancelSubscription: () =>
    apiRequest.post('/subscriptions/cancel'),
    
  getPaymentMethods: () =>
    apiRequest.get('/subscriptions/payment-methods'),
    
  addPaymentMethod: (data: any) =>
    apiRequest.post('/subscriptions/payment-methods', data),
    
  removePaymentMethod: (methodId: string) =>
    apiRequest.delete(`/subscriptions/payment-methods/${methodId}`),
    
  getBillingHistory: () =>
    apiRequest.get('/subscriptions/billing'),
};

// Collaboration API
export const collaborationAPI = {
  inviteCollaborator: (projectId: string, email: string, role: string) =>
    apiRequest.post(`/collaborations/invite`, { projectId, email, role }),
    
  acceptInvitation: (invitationId: string) =>
    apiRequest.post(`/collaborations/accept/${invitationId}`),
    
  rejectInvitation: (invitationId: string) =>
    apiRequest.post(`/collaborations/reject/${invitationId}`),
    
  getCollaborators: (projectId: string) =>
    apiRequest.get(`/collaborations/project/${projectId}`),
    
  updateCollaboratorRole: (projectId: string, userId: string, role: string) =>
    apiRequest.put(`/collaborations/${projectId}/${userId}`, { role }),
    
  removeCollaborator: (projectId: string, userId: string) =>
    apiRequest.delete(`/collaborations/${projectId}/${userId}`),
};

export default api;