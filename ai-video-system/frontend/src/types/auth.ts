export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  subscriptionTier: 'free' | 'basic' | 'pro' | 'enterprise';
  creditsRemaining: number;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
  lastLogin?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordReset {
  token: string;
  password: string;
}

export interface EmailVerification {
  token: string;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  notifications: {
    email: boolean;
    push: boolean;
    marketing: boolean;
  };
  privacy: {
    profileVisibility: 'public' | 'private';
    activityVisibility: 'public' | 'private';
  };
}

export interface UpdateProfileData {
  name?: string;
  avatar?: string;
  preferences?: Partial<UserPreferences>;
}

export interface Subscription {
  id: string;
  tier: 'free' | 'basic' | 'pro' | 'enterprise';
  status: 'active' | 'canceled' | 'past_due' | 'unpaid';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UsageStats {
  videosCreated: number;
  creditsUsed: number;
  storageUsed: number;
  apiCalls: number;
  period: 'daily' | 'weekly' | 'monthly';
}

export interface Session {
  id: string;
  userId: string;
  device: string;
  browser: string;
  ip: string;
  location?: string;
  createdAt: string;
  lastActive: string;
  isActive: boolean;
}