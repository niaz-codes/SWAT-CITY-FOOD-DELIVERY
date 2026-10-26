import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme';
import { AppText } from '../components/AppText';
import { sizes, spacing } from '../theme/spacing';
import { haptics } from '../hooks/useHaptics';

type ToastType = 'success' | 'error' | 'info' | 'warning';

type ToastItem = {
  id: number;
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  show: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const ICON: Record<ToastType, keyof typeof Ionicons.glyphMap> = {
  success: 'checkmark-circle',
  error: 'alert-circle',
  info: 'information-circle',
  warning: 'warning',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const show = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++counter.current;
    setItems((prev) => [...prev.slice(-1), { id, message, type }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (m) => {
        haptics.success();
        show(m, 'success');
      },
      error: (m) => {
        haptics.warning();
        show(m, 'error');
      },
      info: (m) => show(m, 'info'),
    }),
    [show],
  );

  const colorFor = (type: ToastType) => {
    switch (type) {
      case 'success':
        return colors.success;
      case 'error':
        return colors.danger;
      case 'warning':
        return colors.warning;
      default:
        return colors.primary;
    }
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Animated.View pointerEvents="box-none" style={[styles.container, { top: insets.top + 8 }]}>
        {items.map((item) => {
          const tint = colorFor(item.type);
          return (
            <Animated.View
              key={item.id}
              entering={SlideInDown.springify().damping(16)}
              exiting={SlideOutDown.duration(220)}
              style={[styles.toast, { backgroundColor: colors.surfaceRaised, borderColor: tint }]}
            >
              <Pressable
                style={styles.row}
                onPress={() => setItems((prev) => prev.filter((t) => t.id !== item.id))}
              >
                <Ionicons name={ICON[item.type]} size={20} color={tint} />
                <AppText
                  variant="smallMedium"
                  color={colors.textPrimary}
                  style={styles.message}
                  numberOfLines={2}
                >
                  {item.message}
                </AppText>
              </Pressable>
            </Animated.View>
          );
        })}
      </Animated.View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.m,
    right: spacing.m,
    zIndex: 999,
    alignItems: 'center',
    gap: spacing.s,
  },
  toast: {
    minHeight: sizes.input - 8,
    maxWidth: 520,
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.sm,
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  message: { flex: 1 },
});

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
