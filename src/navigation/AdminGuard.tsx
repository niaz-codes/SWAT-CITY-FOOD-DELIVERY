import React, { ComponentType, useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { useAuth } from '../state/AuthContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function userHome(role?: string): 'Main' | 'RiderMain' | 'AdminMain' {
  if (role === 'admin') return 'AdminMain';
  if (role === 'rider') return 'RiderMain';
  return 'Main';
}

/**
 * Role-based route guard. Blocks non-admin users from admin screens and
 * redirects them to their own home stack. Renders nothing while the session
 * is still hydrating to avoid a flash of admin UI.
 */
export function withAdminGuard<P extends object>(Component: ComponentType<P>): ComponentType<P> {
  return function AdminGuarded(props: P) {
    const { user, hydrated } = useAuth();
    const navigation = useNavigation<Nav>();

    useEffect(() => {
      if (!hydrated) return;
      if (!user) {
        navigation.replace('Login');
        return;
      }
      if (user.role !== 'admin') {
        navigation.replace(userHome(user.role));
      }
    }, [hydrated, user, navigation]);

    if (!hydrated || !user || user.role !== 'admin') return null;

    return <Component {...props} />;
  };
}