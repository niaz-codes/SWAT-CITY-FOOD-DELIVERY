import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CartItem, MenuItem } from '../types/domain';

const CART_KEY = '@swat/cart';

type CartState = {
  items: CartItem[];
  restaurantId: string | null;
  count: number;
  subtotal: number;
  add: (item: MenuItem, quantity?: number) => void;
  remove: (menuId: string) => void;
  setQuantity: (menuId: string, quantity: number) => void;
  clear: () => void;
  hydrated: boolean;
};

const CartContext = createContext<CartState | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(CART_KEY)
      .then((raw) => {
        if (raw) setItems(JSON.parse(raw) as CartItem[]);
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  const persist = useCallback((next: CartItem[]) => {
    setItems(next);
    AsyncStorage.setItem(CART_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const add = useCallback(
    (item: MenuItem, quantity = 1) => {
      setItems((prev) => {
        const existing = prev.find((i) => i.menuItem.id === item.id);
        let next: CartItem[];
        if (existing) {
          next = prev.map((i) =>
            i.menuItem.id === item.id ? { ...i, quantity: i.quantity + quantity } : i,
          );
        } else {
          next = [...prev, { menuItem: item, restaurantId: item.restaurantId, quantity }];
        }
        AsyncStorage.setItem(CART_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );

  const remove = useCallback(
    (menuId: string) => {
      setItems((prev) => {
        const next = prev.filter((i) => i.menuItem.id !== menuId);
        AsyncStorage.setItem(CART_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );

  const setQuantity = useCallback(
    (menuId: string, quantity: number) => {
      setItems((prev) => {
        let next: CartItem[];
        if (quantity <= 0) {
          next = prev.filter((i) => i.menuItem.id !== menuId);
        } else {
          next = prev.map((i) => (i.menuItem.id === menuId ? { ...i, quantity } : i));
        }
        AsyncStorage.setItem(CART_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );

  const clear = useCallback(() => {
    setItems([]);
    AsyncStorage.removeItem(CART_KEY).catch(() => {});
  }, []);

  const value = useMemo<CartState>(() => {
    const restaurantId = items.length > 0 ? items[0]!.restaurantId : null;
    const count = items.reduce((acc, i) => acc + i.quantity, 0);
    const subtotal = items.reduce((acc, i) => acc + i.quantity * i.menuItem.price, 0);
    return { items, restaurantId, count, subtotal, add, remove, setQuantity, clear, hydrated };
  }, [items, add, remove, setQuantity, clear, hydrated]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}