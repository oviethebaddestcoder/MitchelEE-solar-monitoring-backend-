// Request types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface InviteEngineerRequest {
  email: string;
  fullName: string;
   phone?:    string | null;
  role: 'engineer';
}

export interface CompleteRegistrationRequest {
  token: string;
  password: string;
}

// Response types
export interface AuthResponse {
  success: boolean;
  message?: string;
  data?: {
    user: {
      id: string;
      email: string;
      fullName: string;
      role: string;
    };
    token: string;
    refreshToken: string;
  };
}

export interface InvitationResponse {
  success: boolean;
  message: string;
  data?: {
    email: string;
    expiresAt: string;
  };
}