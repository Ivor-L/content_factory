import React, { createContext, useState, useContext } from 'react';

export interface UserData {
  name: string;
  avatar: string;
  pointsUsed: number;
  pointsTotal: number;
}

interface UserContextType {
  user: UserData;
  updateUser: (data: Partial<UserData>) => void;
}

const defaultUser: UserData = {
  name: '创作者',
  avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
  pointsUsed: 1250,
  pointsTotal: 5000,
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserData>(() => {
    const saved = localStorage.getItem('USER_DATA');
    return saved ? JSON.parse(saved) : defaultUser;
  });

  const updateUser = (data: Partial<UserData>) => {
    setUser((prev) => {
      const newUser = { ...prev, ...data };
      localStorage.setItem('USER_DATA', JSON.stringify(newUser));
      return newUser;
    });
  };

  return (
    <UserContext.Provider value={{ user, updateUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
