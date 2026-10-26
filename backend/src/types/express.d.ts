declare global {
  namespace Express {
    // Augmented request: populated by requireAuth.
    interface Request {
      user?: {
        _id: string;
        role: 'customer' | 'rider' | 'restaurant' | 'admin';
      };
    }
  }
}

export {};
