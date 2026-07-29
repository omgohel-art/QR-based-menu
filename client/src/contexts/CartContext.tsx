import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from "react";

interface CartItem {
  menuItemId: number;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string | null;
}

interface CartContextValue {
  cart: CartItem[];
  cartTotal: number;
  cartItemCount: number;
  addToCart: (menuItem: { id: number; name: string; price: number | string; imageUrl?: string | null }) => void;
  removeFromCart: (menuItemId: number) => void;
  updateQuantity: (menuItemId: number, quantity: number) => void;
  clearCart: () => void;
  setTableCode: (code: string) => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const MAX_ITEM_QUANTITY = 10;
const CART_TTL_MS = 60 * 60 * 1000;

function getStorageKey(code?: string | null): string {
  return `cafe-cart-${code || "default"}`;
}

function loadCart(code?: string | null): CartItem[] {
  try {
    const raw = localStorage.getItem(getStorageKey(code));
    if (raw) {
      const stored = JSON.parse(raw);
      if (stored && stored.savedAt && Date.now() - stored.savedAt < CART_TTL_MS) {
        return stored.items || [];
      }
      localStorage.removeItem(getStorageKey(code));
    }
  } catch {}
  return [];
}

export { MAX_ITEM_QUANTITY };

export function CartProvider({ children }: { children: ReactNode }) {
  const [tableCode, setTableCodeState] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>(() => loadCart(null));
  const cartRef = useRef(cart);
  cartRef.current = cart;

  const setTableCode = useCallback((code: string) => {
    setTableCodeState(prev => {
      if (prev === code) return prev;
      const data = JSON.stringify({ items: cartRef.current, savedAt: Date.now() });
      localStorage.setItem(getStorageKey(prev), data);
      return code;
    });
    setCart(loadCart(code));
  }, []);

  useEffect(() => {
    const data = JSON.stringify({ items: cart, savedAt: Date.now() });
    localStorage.setItem(getStorageKey(tableCode), data);
  }, [cart, tableCode]);

  const addToCart = useCallback((menuItem: { id: number; name: string; price: number | string; imageUrl?: string | null }) => {
    setCart(prev => {
      const existing = prev.find(item => item.menuItemId === menuItem.id);
      if (existing) {
        if (existing.quantity >= MAX_ITEM_QUANTITY) return prev;
        return prev.map(item =>
          item.menuItemId === menuItem.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, {
        menuItemId: menuItem.id,
        name: menuItem.name,
        price: typeof menuItem.price === 'string' ? parseFloat(menuItem.price) : menuItem.price,
        quantity: 1,
        imageUrl: menuItem.imageUrl ?? null,
      }];
    });
  }, []);

  const removeFromCart = useCallback((menuItemId: number) => {
    setCart(prev => prev.filter(item => item.menuItemId !== menuItemId));
  }, []);

  const updateQuantity = useCallback((menuItemId: number, quantity: number) => {
    if (quantity <= 0) {
      setCart(prev => prev.filter(item => item.menuItemId !== menuItemId));
    } else if (quantity > MAX_ITEM_QUANTITY) {
      return;
    } else {
      setCart(prev =>
        prev.map(item =>
          item.menuItemId === menuItemId
            ? { ...item, quantity }
            : item
        )
      );
    }
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart]
  );

  const cartItemCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  return (
    <CartContext.Provider value={{ cart, cartTotal, cartItemCount, addToCart, removeFromCart, updateQuantity, clearCart, setTableCode }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}